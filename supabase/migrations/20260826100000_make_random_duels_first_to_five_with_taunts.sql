-- Real-time matchmaking now uses the same first-to-five session model as friend battles.
-- Between rounds, only the previous winner may send one of the predefined taunt IDs.

alter table public.duel_sessions
  add column if not exists session_source text not null default 'invite',
  add column if not exists last_taunt_id smallint,
  add column if not exists last_taunt_sender_id uuid references auth.users(id) on delete set null,
  add column if not exists last_taunt_at timestamptz;

alter table public.duel_sessions drop constraint if exists duel_sessions_source_check;
alter table public.duel_sessions
  add constraint duel_sessions_source_check check (session_source in ('random', 'invite'));
alter table public.duel_sessions drop constraint if exists duel_sessions_last_taunt_id_check;
alter table public.duel_sessions
  add constraint duel_sessions_last_taunt_id_check check (last_taunt_id is null or last_taunt_id between 0 and 5);
alter table public.duel_sessions drop constraint if exists duel_sessions_last_taunt_sender_check;
alter table public.duel_sessions
  add constraint duel_sessions_last_taunt_sender_check check (last_taunt_sender_id is null or last_taunt_sender_id in (host_id, guest_id));

create or replace function public.duel_session_json(session_row public.duel_sessions)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  linked_match public.duel_matches;
  me uuid := auth.uid();
begin
  if me <> session_row.host_id and me <> session_row.guest_id then
    raise exception 'SESSION_FORBIDDEN';
  end if;
  if session_row.current_match_id is not null then
    select * into linked_match from public.duel_matches where id = session_row.current_match_id;
  end if;
  return jsonb_build_object(
    'id', session_row.id,
    'source', session_row.session_source,
    'status', session_row.status,
    'round', session_row.round_number,
    'selectedLevel', session_row.selected_level,
    'serverNow', extract(epoch from statement_timestamp()) * 1000,
    'choiceDeadline', case when session_row.choice_deadline is null then null else extract(epoch from session_row.choice_deadline) * 1000 end,
    'myScore', case when me = session_row.host_id then session_row.host_score else session_row.guest_score end,
    'opponentScore', case when me = session_row.host_id then session_row.guest_score else session_row.host_score end,
    'hostScore', session_row.host_score,
    'guestScore', session_row.guest_score,
    'chooserIsMe', session_row.chooser_id = me,
    'chooserName', case when session_row.chooser_id = session_row.host_id then session_row.host_name else session_row.guest_name end,
    'opponentName', case when me = session_row.host_id then session_row.guest_name else session_row.host_name end,
    'isHost', me = session_row.host_id,
    'leftByMe', session_row.left_by = me,
    'opponentLeft', session_row.left_by is not null and session_row.left_by <> me,
    'lastWinnerIsMe', session_row.last_winner_id = me,
    'lastTauntId', session_row.last_taunt_id,
    'lastTauntIsMine', session_row.last_taunt_sender_id = me,
    'match', case when linked_match.id is null then null else public.duel_match_json(linked_match) end
  );
end;
$$;

create or replace function public.duel_session_after_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.duel_sessions;
  next_chooser uuid;
  next_host_score integer;
  next_guest_score integer;
begin
  if new.session_id is null or old.status = 'finished' or new.status <> 'finished' then return new; end if;
  select * into room from public.duel_sessions where id = new.session_id for update;
  if not found or room.status <> 'playing' or room.current_match_id <> new.id then return new; end if;

  next_host_score := room.host_score + case when new.winner_id = room.host_id then 1 else 0 end;
  next_guest_score := room.guest_score + case when new.winner_id = room.guest_id then 1 else 0 end;

  if next_host_score >= 5 or next_guest_score >= 5 then
    update public.duel_sessions set
      status = 'closed',
      round_number = round_number + 1,
      host_score = next_host_score,
      guest_score = next_guest_score,
      chooser_id = null,
      choice_deadline = null,
      last_winner_id = new.winner_id,
      last_taunt_id = null,
      last_taunt_sender_id = null,
      last_taunt_at = null,
      left_by = null,
      closed_at = now(),
      updated_at = now()
    where id = room.id;
    return new;
  end if;

  if new.winner_id = room.host_id then next_chooser := room.guest_id;
  elsif new.winner_id = room.guest_id then next_chooser := room.host_id;
  elsif room.chooser_id = room.host_id then next_chooser := room.guest_id;
  else next_chooser := room.host_id;
  end if;

  update public.duel_sessions set
    status = 'choosing',
    round_number = round_number + 1,
    host_score = next_host_score,
    guest_score = next_guest_score,
    chooser_id = next_chooser,
    choice_deadline = now() + interval '15 seconds',
    last_winner_id = new.winner_id,
    last_taunt_id = null,
    last_taunt_sender_id = null,
    last_taunt_at = null,
    updated_at = now()
  where id = room.id;
  return new;
end;
$$;

create or replace function public.duel_find_or_join(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := public.duel_clean_nickname(p_nickname);
  active_room public.duel_sessions;
  existing_match public.duel_matches;
  opponent public.duel_queue;
  new_match public.duel_matches;
  new_session public.duel_sessions;
  chosen_level integer;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('hachan-cat-duel-queue'));

  select * into active_room from public.duel_sessions
  where status <> 'closed' and me in (host_id, guest_id)
  order by created_at desc limit 1;
  if found then
    if active_room.status = 'playing' and active_room.current_match_id is not null then
      select * into existing_match from public.duel_matches where id = active_room.current_match_id;
      if found and existing_match.status = 'ready' then
        return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(existing_match));
      end if;
    end if;
    raise exception 'ACTIVE_SESSION';
  end if;

  update public.duel_matches set status = 'expired'
    where status = 'ready' and opponent_kind = 'ghost' and player_one = me;
  delete from public.duel_queue where heartbeat_at < now() - interval '20 seconds';
  update public.duel_matches set status = 'expired' where status = 'ready' and expires_at < now();

  select * into existing_match from public.duel_matches
  where status = 'ready' and opponent_kind = 'live' and expires_at > now()
    and (player_one = me or player_two = me)
  order by created_at desc limit 1;
  if found then
    if existing_match.session_id is null and existing_match.match_source = 'random' then
      insert into public.duel_sessions (
        host_id, guest_id, host_name, guest_name, selected_level, session_source
      ) values (
        existing_match.player_one, existing_match.player_two, existing_match.player_one_name,
        existing_match.player_two_name, existing_match.level, 'random'
      ) returning * into new_session;
      update public.duel_matches set session_id = new_session.id, session_round = 1
      where id = existing_match.id returning * into existing_match;
      update public.duel_sessions set current_match_id = existing_match.id, updated_at = now()
      where id = new_session.id;
    end if;
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(existing_match));
  end if;

  select * into opponent from public.duel_queue queued
  where queued.user_id <> me and queued.heartbeat_at >= now() - interval '20 seconds'
    and not exists (
      select 1 from public.duel_sessions session
      where session.status <> 'closed' and queued.user_id in (session.host_id, session.guest_id)
    )
    and not exists (
      select 1 from public.duel_matches duel_match
      where duel_match.status = 'ready' and duel_match.expires_at > now()
        and queued.user_id in (duel_match.player_one, duel_match.player_two)
    )
  order by queued.joined_at for update skip locked limit 1;
  if found then
    chosen_level := 3 + floor(random() * 6)::integer;
    insert into public.duel_sessions (
      host_id, guest_id, host_name, guest_name, selected_level, session_source
    ) values (
      opponent.user_id, me, opponent.nickname, clean_name, chosen_level, 'random'
    ) returning * into new_session;

    insert into public.duel_matches (
      player_one, player_two, player_one_name, player_two_name, level, seed,
      starts_at, expires_at, opponent_kind, match_source, session_id, session_round
    ) values (
      opponent.user_id, me, opponent.nickname, clean_name,
      chosen_level, floor(random() * 2000000000)::integer,
      now() + interval '3 seconds', now() + interval '24 hours', 'live', 'random', new_session.id, 1
    ) returning * into new_match;
    update public.duel_sessions set current_match_id = new_match.id, updated_at = now()
    where id = new_session.id;
    delete from public.duel_queue where user_id in (opponent.user_id, me);
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match));
  end if;

  insert into public.duel_queue (user_id, nickname, joined_at, heartbeat_at)
  values (me, clean_name, now(), now())
  on conflict (user_id) do update set nickname = excluded.nickname, heartbeat_at = now();
  return jsonb_build_object('state', 'waiting',
    'onlineCount', (select count(*) from public.duel_queue where heartbeat_at >= now() - interval '20 seconds'));
end;
$$;

create or replace function public.duel_choose_session_cat(p_session_id uuid, p_level integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  room public.duel_sessions;
  new_match public.duel_matches;
  chosen_level integer;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into room from public.duel_sessions where id = p_session_id and me in (host_id, guest_id) for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if room.status = 'closed' then return public.duel_session_json(room); end if;
  if room.status = 'playing' then return public.duel_session_json(room); end if;
  if me <> room.chooser_id and (room.choice_deadline is null or now() < room.choice_deadline) then raise exception 'NOT_CHOOSER'; end if;
  chosen_level := coalesce(p_level, room.selected_level);
  if chosen_level not between 1 and 10 then raise exception 'INVALID_LEVEL'; end if;

  insert into public.duel_matches (
    player_one, player_two, player_one_name, player_two_name, level, seed, starts_at, expires_at,
    opponent_kind, match_source, session_id, session_round
  ) values (
    room.host_id, room.guest_id, room.host_name, room.guest_name, chosen_level,
    floor(random() * 2000000000)::integer, now() + interval '4 seconds', now() + interval '24 hours',
    'live', room.session_source, room.id, room.round_number
  ) returning * into new_match;

  update public.duel_sessions set
    status = 'playing',
    selected_level = chosen_level,
    current_match_id = new_match.id,
    choice_deadline = null,
    last_taunt_id = null,
    last_taunt_sender_id = null,
    last_taunt_at = null,
    updated_at = now()
  where id = room.id returning * into room;
  return public.duel_session_json(room);
end;
$$;

create or replace function public.duel_send_session_taunt(p_session_id uuid, p_taunt_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  room public.duel_sessions;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_taunt_id is null or p_taunt_id not between 0 and 5 then raise exception 'INVALID_TAUNT'; end if;
  select * into room from public.duel_sessions
  where id = p_session_id and me in (host_id, guest_id) for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if room.status <> 'choosing' or room.last_winner_id is distinct from me or room.chooser_id = me then
    raise exception 'TAUNT_FORBIDDEN';
  end if;
  update public.duel_sessions set
    last_taunt_id = p_taunt_id,
    last_taunt_sender_id = me,
    last_taunt_at = now(),
    updated_at = now()
  where id = room.id returning * into room;
  return public.duel_session_json(room);
end;
$$;

revoke execute on function public.duel_session_json(public.duel_sessions) from public, anon, authenticated;
revoke execute on function public.duel_session_after_match() from public, anon, authenticated;
revoke execute on function public.duel_find_or_join(text) from public, anon;
revoke execute on function public.duel_choose_session_cat(uuid, integer) from public, anon;
revoke execute on function public.duel_send_session_taunt(uuid, integer) from public, anon;
grant execute on function public.duel_find_or_join(text) to authenticated;
grant execute on function public.duel_choose_session_cat(uuid, integer) to authenticated;
grant execute on function public.duel_send_session_taunt(uuid, integer) to authenticated;
