alter table public.duel_matches drop constraint if exists duel_matches_level_check;
alter table public.duel_matches add constraint duel_matches_level_check check (level between 1 and 10);
alter table public.duel_runs drop constraint if exists duel_runs_level_check;
alter table public.duel_runs add constraint duel_runs_level_check check (level between 1 and 10);

create table if not exists public.duel_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null,
  guest_name text not null,
  status text not null default 'playing' check (status in ('playing', 'choosing', 'closed')),
  round_number integer not null default 1 check (round_number >= 1),
  host_score integer not null default 0 check (host_score >= 0),
  guest_score integer not null default 0 check (guest_score >= 0),
  selected_level smallint not null check (selected_level between 1 and 10),
  chooser_id uuid references auth.users(id) on delete set null,
  choice_deadline timestamptz,
  current_match_id uuid,
  last_winner_id uuid references auth.users(id) on delete set null,
  left_by uuid references auth.users(id) on delete set null,
  host_seen_at timestamptz not null default now(),
  guest_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check (host_id <> guest_id),
  check (chooser_id is null or chooser_id in (host_id, guest_id)),
  check (left_by is null or left_by in (host_id, guest_id))
);

alter table public.duel_matches
  add column if not exists session_id uuid references public.duel_sessions(id) on delete set null,
  add column if not exists session_round integer check (session_round is null or session_round >= 1);

alter table public.duel_sessions
  add constraint duel_sessions_current_match_fkey
  foreign key (current_match_id) references public.duel_matches(id) on delete set null;

alter table public.duel_invites
  add column if not exists selected_level smallint not null default 3 check (selected_level between 1 and 10),
  add column if not exists session_id uuid references public.duel_sessions(id) on delete set null;

create index if not exists duel_sessions_host_recent_idx on public.duel_sessions (host_id, created_at desc);
create index if not exists duel_sessions_guest_recent_idx on public.duel_sessions (guest_id, created_at desc);
create index if not exists duel_matches_session_round_idx on public.duel_matches (session_id, session_round);

alter table public.duel_sessions enable row level security;
revoke all on public.duel_sessions from anon, authenticated;
grant select on public.duel_sessions to authenticated;

create policy "session players can read their room"
on public.duel_sessions for select
to authenticated
using (auth.uid() = host_id or auth.uid() = guest_id);

create or replace function public.duel_match_json(match_row public.duel_matches)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', match_row.id,
    'level', match_row.level,
    'seed', match_row.seed,
    'serverNow', extract(epoch from statement_timestamp()) * 1000,
    'startsAt', extract(epoch from match_row.starts_at) * 1000,
    'expiresAt', extract(epoch from match_row.expires_at) * 1000,
    'status', match_row.status,
    'opponentKind', match_row.opponent_kind,
    'matchSource', match_row.match_source,
    'sessionId', match_row.session_id,
    'sessionRound', match_row.session_round,
    'opponentName', case when auth.uid() = match_row.player_one then match_row.player_two_name else match_row.player_one_name end,
    'ghostElapsedMs', match_row.ghost_elapsed_ms,
    'winnerId', match_row.winner_id,
    'winnerSide', match_row.winner_side,
    'winnerElapsedMs', match_row.winner_elapsed_ms,
    'winnerAttempts', match_row.winner_attempts,
    'winnerAccuracy', match_row.winner_accuracy,
    'isDraw', match_row.status = 'finished' and match_row.opponent_kind = 'live' and match_row.winner_id is null,
    'didWin', case
      when match_row.status <> 'finished' then null
      when match_row.opponent_kind = 'ghost' then match_row.winner_side = 'player'
      else match_row.winner_id = auth.uid()
    end
  );
$$;

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
    'match', case when linked_match.id is null then null else public.duel_match_json(linked_match) end
  );
end;
$$;

create or replace function public.duel_invite_json(invite_row public.duel_invites)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  linked_match public.duel_matches;
  linked_session public.duel_sessions;
begin
  if auth.uid() <> invite_row.host_id and auth.uid() is distinct from invite_row.guest_id then
    raise exception 'INVITE_FORBIDDEN';
  end if;
  if invite_row.match_id is not null then
    select * into linked_match from public.duel_matches where id = invite_row.match_id;
  end if;
  if invite_row.session_id is not null then
    select * into linked_session from public.duel_sessions where id = invite_row.session_id;
  end if;
  return jsonb_build_object(
    'id', invite_row.id,
    'status', invite_row.status,
    'hostName', invite_row.host_name,
    'guestName', invite_row.guest_name,
    'selectedLevel', invite_row.selected_level,
    'serverNow', extract(epoch from statement_timestamp()) * 1000,
    'expiresAt', extract(epoch from invite_row.expires_at) * 1000,
    'isHost', auth.uid() = invite_row.host_id,
    'isGuest', auth.uid() = invite_row.guest_id,
    'match', case when linked_match.id is null then null else public.duel_match_json(linked_match) end,
    'session', case when linked_session.id is null then null else public.duel_session_json(linked_session) end
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
begin
  if new.session_id is null or old.status = 'finished' or new.status <> 'finished' then return new; end if;
  select * into room from public.duel_sessions where id = new.session_id for update;
  if not found or room.status <> 'playing' or room.current_match_id <> new.id then return new; end if;

  if new.winner_id = room.host_id then next_chooser := room.guest_id;
  elsif new.winner_id = room.guest_id then next_chooser := room.host_id;
  elsif room.chooser_id = room.host_id then next_chooser := room.guest_id;
  else next_chooser := room.host_id;
  end if;

  update public.duel_sessions set
    status = 'choosing',
    round_number = round_number + 1,
    host_score = host_score + case when new.winner_id = host_id then 1 else 0 end,
    guest_score = guest_score + case when new.winner_id = guest_id then 1 else 0 end,
    chooser_id = next_chooser,
    choice_deadline = now() + interval '15 seconds',
    last_winner_id = new.winner_id,
    updated_at = now()
  where id = room.id;
  return new;
end;
$$;

drop trigger if exists duel_matches_update_session on public.duel_matches;
create trigger duel_matches_update_session
after update of status on public.duel_matches
for each row execute function public.duel_session_after_match();

create or replace function public.duel_create_invite(p_nickname text, p_level integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  clean_name text := public.duel_clean_nickname(p_nickname);
  invite_token text;
  new_invite public.duel_invites;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_level not between 1 and 10 then raise exception 'INVALID_LEVEL'; end if;
  if exists (select 1 from public.duel_sessions where status <> 'closed' and (host_id = me or guest_id = me)) then
    raise exception 'ACTIVE_SESSION';
  end if;
  if exists (select 1 from public.duel_matches where status = 'ready' and expires_at > now() and (player_one = me or player_two = me)) then
    raise exception 'ACTIVE_MATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('hachan-cat-invite-' || me::text));
  update public.duel_invites set status = 'expired' where status = 'waiting' and expires_at <= now();
  update public.duel_invites set status = 'cancelled' where host_id = me and status = 'waiting';
  delete from public.duel_queue where user_id = me;

  invite_token := replace(replace(rtrim(encode(gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_');
  insert into public.duel_invites (token_hash, host_id, host_name, selected_level)
  values (digest(invite_token, 'sha256'), me, clean_name, p_level)
  returning * into new_invite;
  return jsonb_build_object('token', invite_token, 'invite', public.duel_invite_json(new_invite));
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
  existing_match public.duel_matches;
  opponent public.duel_queue;
  new_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from public.duel_sessions where status <> 'closed' and (host_id = me or guest_id = me)) then
    raise exception 'ACTIVE_SESSION';
  end if;
  perform pg_advisory_xact_lock(hashtext('hachan-cat-duel-queue'));
  update public.duel_matches set status = 'expired'
    where status = 'ready' and opponent_kind = 'ghost' and player_one = me;
  delete from public.duel_queue where heartbeat_at < now() - interval '20 seconds';
  update public.duel_matches set status = 'expired' where status = 'ready' and expires_at < now();

  select * into existing_match from public.duel_matches
  where status = 'ready' and opponent_kind = 'live' and expires_at > now()
    and (player_one = me or player_two = me)
  order by created_at desc limit 1;
  if found then return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(existing_match)); end if;

  select * into opponent from public.duel_queue
  where user_id <> me and heartbeat_at >= now() - interval '20 seconds'
  order by joined_at for update skip locked limit 1;
  if found then
    insert into public.duel_matches (
      player_one, player_two, player_one_name, player_two_name, level, seed,
      starts_at, expires_at, opponent_kind, match_source
    ) values (
      opponent.user_id, me, opponent.nickname, clean_name,
      3 + floor(random() * 6)::smallint, floor(random() * 2000000000)::integer,
      now() + interval '3 seconds', now() + interval '18 seconds', 'live', 'random'
    ) returning * into new_match;
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

create or replace function public.duel_create_invite(p_nickname text)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.duel_create_invite(p_nickname, 3 + floor(random() * 6)::integer); $$;

create or replace function public.duel_preview_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  current_invite public.duel_invites;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_token is null or char_length(p_token) not between 20 and 40 then return jsonb_build_object('state', 'missing'); end if;
  select * into current_invite from public.duel_invites where token_hash = digest(p_token, 'sha256') for update;
  if not found then return jsonb_build_object('state', 'missing'); end if;
  if current_invite.status = 'waiting' and current_invite.expires_at <= now() then
    update public.duel_invites set status = 'expired' where id = current_invite.id returning * into current_invite;
  end if;
  if me = current_invite.host_id or me = current_invite.guest_id then
    return jsonb_build_object('state', current_invite.status, 'invite', public.duel_invite_json(current_invite));
  end if;
  return jsonb_build_object(
    'state', case when current_invite.status = 'matched' then 'full' else current_invite.status end,
    'hostName', current_invite.host_name,
    'selectedLevel', current_invite.selected_level,
    'serverNow', extract(epoch from statement_timestamp()) * 1000,
    'expiresAt', extract(epoch from current_invite.expires_at) * 1000
  );
end;
$$;

create or replace function public.duel_accept_invite(p_token text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  clean_name text := public.duel_clean_nickname(p_nickname);
  current_invite public.duel_invites;
  new_match public.duel_matches;
  new_session public.duel_sessions;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_token is null or char_length(p_token) not between 20 and 40 then return jsonb_build_object('state', 'missing'); end if;
  select * into current_invite from public.duel_invites where token_hash = digest(p_token, 'sha256') for update;
  if not found then return jsonb_build_object('state', 'missing'); end if;
  if current_invite.status = 'waiting' and current_invite.expires_at <= now() then
    update public.duel_invites set status = 'expired' where id = current_invite.id returning * into current_invite;
  end if;
  if me = current_invite.host_id then return jsonb_build_object('state', 'own', 'invite', public.duel_invite_json(current_invite)); end if;
  if current_invite.status = 'matched' and me = current_invite.guest_id then
    select * into new_session from public.duel_sessions where id = current_invite.session_id;
    select * into new_match from public.duel_matches where id = current_invite.match_id;
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match), 'session', public.duel_session_json(new_session));
  end if;
  if current_invite.status <> 'waiting' then
    return jsonb_build_object('state', case when current_invite.status = 'matched' then 'full' else current_invite.status end);
  end if;
  if exists (select 1 from public.duel_sessions where status <> 'closed' and (host_id in (current_invite.host_id, me) or guest_id in (current_invite.host_id, me))) then
    return jsonb_build_object('state', 'busy');
  end if;
  if exists (select 1 from public.duel_matches where status = 'ready' and expires_at > now() and (player_one in (current_invite.host_id, me) or player_two in (current_invite.host_id, me))) then
    return jsonb_build_object('state', 'busy');
  end if;

  insert into public.duel_sessions (host_id, guest_id, host_name, guest_name, selected_level, chooser_id)
  values (current_invite.host_id, me, current_invite.host_name, clean_name, current_invite.selected_level, current_invite.host_id)
  returning * into new_session;

  insert into public.duel_matches (
    player_one, player_two, player_one_name, player_two_name, level, seed, starts_at, expires_at,
    opponent_kind, match_source, session_id, session_round
  ) values (
    current_invite.host_id, me, current_invite.host_name, clean_name, current_invite.selected_level,
    floor(random() * 2000000000)::integer, now() + interval '5 seconds', now() + interval '20 seconds',
    'live', 'invite', new_session.id, 1
  ) returning * into new_match;

  update public.duel_sessions set current_match_id = new_match.id, updated_at = now() where id = new_session.id returning * into new_session;
  update public.duel_invites set guest_id = me, guest_name = clean_name, match_id = new_match.id,
    session_id = new_session.id, status = 'matched', accepted_at = now()
  where id = current_invite.id returning * into current_invite;
  delete from public.duel_queue where user_id in (current_invite.host_id, me);
  return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match), 'session', public.duel_session_json(new_session));
end;
$$;

create or replace function public.duel_get_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare room public.duel_sessions;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into room from public.duel_sessions where id = p_session_id and auth.uid() in (host_id, guest_id) for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if room.status <> 'closed' then
    if (auth.uid() = room.host_id and room.guest_seen_at < now() - interval '45 seconds')
      or (auth.uid() = room.guest_id and room.host_seen_at < now() - interval '45 seconds') then
      update public.duel_sessions set status = 'closed',
        left_by = case when auth.uid() = host_id then guest_id else host_id end,
        closed_at = now(), choice_deadline = null, updated_at = now()
      where id = room.id returning * into room;
    elsif (auth.uid() = room.host_id and room.host_seen_at < now() - interval '5 seconds')
      or (auth.uid() = room.guest_id and room.guest_seen_at < now() - interval '5 seconds') then
      update public.duel_sessions set
        host_seen_at = case when auth.uid() = host_id then now() else host_seen_at end,
        guest_seen_at = case when auth.uid() = guest_id then now() else guest_seen_at end,
        updated_at = now()
      where id = room.id returning * into room;
    end if;
  end if;
  return public.duel_session_json(room);
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
    floor(random() * 2000000000)::integer, now() + interval '4 seconds', now() + interval '19 seconds',
    'live', 'invite', room.id, room.round_number
  ) returning * into new_match;

  update public.duel_sessions set status = 'playing', selected_level = chosen_level,
    current_match_id = new_match.id, choice_deadline = null, updated_at = now()
  where id = room.id returning * into room;
  return public.duel_session_json(room);
end;
$$;

create or replace function public.duel_leave_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  room public.duel_sessions;
  current_match public.duel_matches;
  other_player uuid;
  my_name text;
  other_name text;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into room from public.duel_sessions where id = p_session_id and me in (host_id, guest_id) for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if room.status = 'closed' then return public.duel_session_json(room); end if;
  other_player := case when me = room.host_id then room.guest_id else room.host_id end;
  my_name := case when me = room.host_id then room.host_name else room.guest_name end;
  other_name := case when me = room.host_id then room.guest_name else room.host_name end;

  update public.duel_sessions set status = 'closed', left_by = me, closed_at = now(), choice_deadline = null, updated_at = now()
  where id = room.id returning * into room;
  if room.current_match_id is not null then
    select * into current_match from public.duel_matches where id = room.current_match_id for update;
    if found and current_match.status = 'ready' then
      update public.duel_matches set status = 'finished', winner_id = other_player, winner_side = 'player', finished_at = now()
      where id = current_match.id;
      perform public.duel_record_match_profile(me, my_name, false, null, false, 'invite');
      perform public.duel_record_match_profile(other_player, other_name, true, null, false, 'invite');
    end if;
  end if;
  return public.duel_session_json(room);
end;
$$;

create or replace function public.duel_weekly_league()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with weekly_wins as (
    select winner_id as user_id,
      max(case when winner_id = player_one then player_one_name else player_two_name end) as snapshot_name,
      count(*)::integer as wins,
      (count(*) * 3)::integer as points,
      min(winner_elapsed_ms)::integer as fastest_win_ms
    from public.duel_matches
    where status = 'finished' and winner_id is not null
      and opponent_kind = 'live' and match_source = 'random'
      and finished_at >= (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    group by winner_id
  ), named as (
    select weekly_wins.user_id, coalesce(profile.nickname, weekly_wins.snapshot_name) as nickname,
      weekly_wins.wins, weekly_wins.points, weekly_wins.fastest_win_ms
    from weekly_wins left join public.duel_profiles profile on profile.user_id = weekly_wins.user_id
  ), ranked as (
    select user_id, nickname, wins, points, fastest_win_ms,
      row_number() over (order by points desc, fastest_win_ms asc nulls last, user_id)::integer as rank
    from named
  )
  select jsonb_build_object(
    'weekStartsAt', extract(epoch from (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) * 1000,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'rank', rank, 'nickname', nickname, 'wins', wins, 'points', points,
      'fastestWinMs', fastest_win_ms, 'isMe', user_id = auth.uid()
    ) order by rank) from ranked where rank <= 20), '[]'::jsonb),
    'myRank', (select rank from ranked where user_id = auth.uid())
  );
$$;

revoke execute on function public.duel_session_json(public.duel_sessions) from public, anon, authenticated;
revoke execute on function public.duel_session_after_match() from public, anon, authenticated;
revoke execute on function public.duel_create_invite(text, integer) from public, anon;
revoke execute on function public.duel_create_invite(text) from public, anon;
revoke execute on function public.duel_get_session(uuid) from public, anon;
revoke execute on function public.duel_choose_session_cat(uuid, integer) from public, anon;
revoke execute on function public.duel_leave_session(uuid) from public, anon;

grant execute on function public.duel_create_invite(text, integer) to authenticated;
grant execute on function public.duel_create_invite(text) to authenticated;
grant execute on function public.duel_get_session(uuid) to authenticated;
grant execute on function public.duel_choose_session_cat(uuid, integer) to authenticated;
grant execute on function public.duel_leave_session(uuid) to authenticated;

alter publication supabase_realtime add table public.duel_sessions;
