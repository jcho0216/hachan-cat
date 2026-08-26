alter table public.duel_matches
  add column if not exists match_source text not null default 'random';

update public.duel_matches
set match_source = 'ghost'
where opponent_kind = 'ghost' and match_source <> 'ghost';

do $$
begin
  alter table public.duel_matches
    add constraint duel_matches_match_source_check
    check (match_source in ('random', 'ghost', 'invite'));
exception when duplicate_object then null;
end $$;

alter table public.duel_profiles
  add column if not exists friend_matches integer not null default 0 check (friend_matches >= 0),
  add column if not exists friend_wins integer not null default 0 check (friend_wins >= 0),
  add column if not exists friend_losses integer not null default 0 check (friend_losses >= 0);

create table if not exists public.duel_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null check (char_length(host_name) between 2 and 18),
  guest_id uuid references auth.users(id) on delete set null,
  guest_name text check (guest_name is null or char_length(guest_name) between 2 and 18),
  match_id uuid unique references public.duel_matches(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  accepted_at timestamptz
);

create index if not exists duel_invites_host_recent_idx on public.duel_invites (host_id, created_at desc);
create index if not exists duel_invites_guest_recent_idx on public.duel_invites (guest_id, created_at desc);
create index if not exists duel_invites_expiry_idx on public.duel_invites (status, expires_at);

alter table public.duel_invites enable row level security;
revoke all on public.duel_invites from anon, authenticated;
grant select on public.duel_invites to authenticated;

create policy "invite participants can read their rooms"
on public.duel_invites for select
to authenticated
using (auth.uid() = host_id or auth.uid() = guest_id);

create or replace function public.duel_set_match_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.opponent_kind = 'ghost' then
    new.match_source := 'ghost';
  elsif new.match_source <> 'invite' then
    new.match_source := 'random';
  end if;
  return new;
end;
$$;

drop trigger if exists duel_matches_set_source on public.duel_matches;
create trigger duel_matches_set_source
before insert or update of opponent_kind, match_source on public.duel_matches
for each row execute function public.duel_set_match_source();

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

create or replace function public.duel_record_match_profile(
  p_user_id uuid,
  p_nickname text,
  p_won boolean,
  p_elapsed_ms integer,
  p_ghost_win boolean,
  p_match_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_match_source = 'invite' then
    insert into public.duel_profiles (
      user_id, nickname, friend_matches, friend_wins, friend_losses
    ) values (
      p_user_id, p_nickname, 1, case when p_won then 1 else 0 end, case when p_won then 0 else 1 end
    )
    on conflict (user_id) do update set
      nickname = excluded.nickname,
      friend_matches = duel_profiles.friend_matches + 1,
      friend_wins = duel_profiles.friend_wins + excluded.friend_wins,
      friend_losses = duel_profiles.friend_losses + excluded.friend_losses,
      updated_at = now();
  else
    perform public.duel_record_profile(p_user_id, p_nickname, p_won, p_elapsed_ms, p_ghost_win);
  end if;
end;
$$;

create or replace function public.duel_claim(
  p_match_id uuid, p_elapsed_ms integer, p_attempts integer, p_accuracy integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_elapsed_ms not between 450 and 15000
    or p_attempts not between 1 and 5
    or p_accuracy not between 0 and 100 then
    raise exception 'INVALID_RESULT';
  end if;

  select * into current_match from public.duel_matches
  where id = p_match_id and (player_one = me or player_two = me)
  for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;
  if now() < current_match.starts_at + interval '450 milliseconds' then raise exception 'TOO_EARLY'; end if;

  if current_match.opponent_kind = 'ghost' then
    update public.duel_matches set
      status = 'finished',
      winner_id = case when p_elapsed_ms < ghost_elapsed_ms then me else null end,
      winner_side = case when p_elapsed_ms < ghost_elapsed_ms then 'player' else 'ghost' end,
      winner_elapsed_ms = least(p_elapsed_ms, ghost_elapsed_ms),
      winner_attempts = p_attempts,
      winner_accuracy = p_accuracy,
      finished_at = now()
    where id = p_match_id returning * into current_match;
    perform public.duel_record_match_profile(
      me, current_match.player_one_name, current_match.winner_side = 'player', p_elapsed_ms,
      current_match.winner_side = 'player', current_match.match_source
    );
  else
    update public.duel_matches set
      status = 'finished', winner_id = me, winner_side = 'player',
      winner_elapsed_ms = p_elapsed_ms, winner_attempts = p_attempts,
      winner_accuracy = p_accuracy, finished_at = now()
    where id = p_match_id and status = 'ready'
    returning * into current_match;
    if not found then select * into current_match from public.duel_matches where id = p_match_id; end if;
    if current_match.winner_id = me then
      perform public.duel_record_match_profile(
        me,
        case when current_match.player_one = me then current_match.player_one_name else current_match.player_two_name end,
        true, p_elapsed_ms, false, current_match.match_source
      );
      perform public.duel_record_match_profile(
        case when current_match.player_one = me then current_match.player_two else current_match.player_one end,
        case when current_match.player_one = me then current_match.player_two_name else current_match.player_one_name end,
        false, null, false, current_match.match_source
      );
    end if;
  end if;

  insert into public.duel_runs (user_id, nickname, level, seed, elapsed_ms, attempts, accuracy)
  values (
    me,
    case when current_match.player_one = me then current_match.player_one_name else current_match.player_two_name end,
    current_match.level, current_match.seed, p_elapsed_ms, p_attempts, p_accuracy
  );
  return public.duel_match_json(current_match);
end;
$$;

create or replace function public.duel_finish_ghost(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_match from public.duel_matches
  where id = p_match_id and player_one = me and opponent_kind = 'ghost'
  for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;
  if now() < current_match.starts_at + current_match.ghost_elapsed_ms * interval '1 millisecond' then
    raise exception 'GHOST_STILL_RUNNING';
  end if;
  update public.duel_matches set
    status = 'finished', winner_id = null, winner_side = 'ghost',
    winner_elapsed_ms = ghost_elapsed_ms, finished_at = now()
  where id = p_match_id and status = 'ready'
  returning * into current_match;
  if not found then select * into current_match from public.duel_matches where id = p_match_id; end if;
  perform public.duel_record_match_profile(me, current_match.player_one_name, false, null, false, current_match.match_source);
  return public.duel_match_json(current_match);
end;
$$;

create or replace function public.duel_forfeit(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
  other_player uuid;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_match from public.duel_matches
  where id = p_match_id and (player_one = me or player_two = me)
  for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;
  other_player := case when current_match.player_one = me then current_match.player_two else current_match.player_one end;
  update public.duel_matches set
    status = 'finished',
    winner_id = case when opponent_kind = 'live' then other_player else null end,
    winner_side = case when opponent_kind = 'ghost' then 'ghost' else 'player' end,
    winner_elapsed_ms = case when opponent_kind = 'ghost' then ghost_elapsed_ms else null end,
    finished_at = now()
  where id = p_match_id and status = 'ready'
  returning * into current_match;
  if not found then select * into current_match from public.duel_matches where id = p_match_id; end if;
  perform public.duel_record_match_profile(
    me,
    case when current_match.player_one = me then current_match.player_one_name else current_match.player_two_name end,
    false, null, false, current_match.match_source
  );
  if current_match.opponent_kind = 'live' and other_player is not null then
    perform public.duel_record_match_profile(
      other_player,
      case when current_match.player_one = me then current_match.player_two_name else current_match.player_one_name end,
      true, null, false, current_match.match_source
    );
  end if;
  return public.duel_match_json(current_match);
end;
$$;

create or replace function public.duel_mark_failure(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_match from public.duel_matches
  where id = p_match_id and (player_one = me or player_two = me)
  for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;

  if current_match.opponent_kind = 'ghost' then
    update public.duel_matches set status = 'finished', winner_id = null, winner_side = 'ghost',
      winner_elapsed_ms = ghost_elapsed_ms, finished_at = now()
    where id = p_match_id and status = 'ready' returning * into current_match;
    perform public.duel_record_match_profile(me, current_match.player_one_name, false, null, false, current_match.match_source);
    return public.duel_match_json(current_match);
  end if;

  update public.duel_matches set
    player_one_failed_at = case when player_one = me then coalesce(player_one_failed_at, now()) else player_one_failed_at end,
    player_two_failed_at = case when player_two = me then coalesce(player_two_failed_at, now()) else player_two_failed_at end
  where id = p_match_id returning * into current_match;

  if current_match.player_one_failed_at is not null and current_match.player_two_failed_at is not null then
    update public.duel_matches set status = 'finished', winner_id = null, winner_side = null, finished_at = now()
    where id = p_match_id and status = 'ready' returning * into current_match;
    perform public.duel_record_match_profile(current_match.player_one, current_match.player_one_name, false, null, false, current_match.match_source);
    perform public.duel_record_match_profile(current_match.player_two, current_match.player_two_name, false, null, false, current_match.match_source);
  end if;
  return public.duel_match_json(current_match);
end;
$$;

create or replace function public.duel_settle_failure(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
  failed_at timestamptz;
  winning_player uuid;
  winning_name text;
  losing_player uuid;
  losing_name text;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_match from public.duel_matches
  where id = p_match_id and opponent_kind = 'live' and (player_one = me or player_two = me)
  for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;
  failed_at := coalesce(current_match.player_one_failed_at, current_match.player_two_failed_at);
  if failed_at is null then raise exception 'NO_FAILURE'; end if;
  if now() < failed_at + interval '600 milliseconds' then raise exception 'SETTLEMENT_PENDING'; end if;

  if current_match.player_one_failed_at is not null and current_match.player_two_failed_at is not null then
    update public.duel_matches set status = 'finished', winner_id = null, winner_side = null, finished_at = now()
    where id = p_match_id and status = 'ready' returning * into current_match;
    perform public.duel_record_match_profile(current_match.player_one, current_match.player_one_name, false, null, false, current_match.match_source);
    perform public.duel_record_match_profile(current_match.player_two, current_match.player_two_name, false, null, false, current_match.match_source);
  else
    winning_player := case when current_match.player_one_failed_at is null then current_match.player_one else current_match.player_two end;
    winning_name := case when current_match.player_one_failed_at is null then current_match.player_one_name else current_match.player_two_name end;
    losing_player := case when current_match.player_one_failed_at is not null then current_match.player_one else current_match.player_two end;
    losing_name := case when current_match.player_one_failed_at is not null then current_match.player_one_name else current_match.player_two_name end;
    update public.duel_matches set status = 'finished', winner_id = winning_player, winner_side = 'player', finished_at = now()
    where id = p_match_id and status = 'ready' returning * into current_match;
    perform public.duel_record_match_profile(winning_player, winning_name, true, null, false, current_match.match_source);
    perform public.duel_record_match_profile(losing_player, losing_name, false, null, false, current_match.match_source);
  end if;
  return public.duel_match_json(current_match);
end;
$$;

create or replace function public.duel_get_profile()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'nickname', coalesce(profile.nickname, ''),
    'matches', coalesce(profile.matches, 0),
    'wins', coalesce(profile.wins, 0),
    'losses', coalesce(profile.losses, 0),
    'currentStreak', coalesce(profile.current_streak, 0),
    'bestStreak', coalesce(profile.best_streak, 0),
    'fastestWinMs', profile.fastest_win_ms,
    'ghostWins', coalesce(profile.ghost_wins, 0),
    'friendMatches', coalesce(profile.friend_matches, 0),
    'friendWins', coalesce(profile.friend_wins, 0),
    'friendLosses', coalesce(profile.friend_losses, 0)
  )
  from (select auth.uid() as user_id) me
  left join public.duel_profiles profile on profile.user_id = me.user_id;
$$;

create or replace function public.duel_weekly_league()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with weekly_wins as (
    select
      winner_id as user_id,
      max(case when winner_id = player_one then player_one_name else player_two_name end) as nickname,
      count(*)::integer as wins,
      sum(case when opponent_kind = 'live' then 3 else 1 end)::integer as points,
      min(winner_elapsed_ms)::integer as fastest_win_ms
    from public.duel_matches
    where status = 'finished'
      and winner_id is not null
      and match_source <> 'invite'
      and finished_at >= (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    group by winner_id
  ), ranked as (
    select user_id, nickname, wins, points, fastest_win_ms,
      row_number() over (order by points desc, fastest_win_ms asc nulls last, user_id)::integer as rank
    from weekly_wins
  )
  select jsonb_build_object(
    'weekStartsAt', extract(epoch from (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) * 1000,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', rank, 'nickname', nickname, 'wins', wins, 'points', points, 'fastestWinMs', fastest_win_ms,
        'isMe', user_id = auth.uid()
      ) order by rank) from ranked where rank <= 20
    ), '[]'::jsonb),
    'myRank', (select rank from ranked where user_id = auth.uid())
  );
$$;

create or replace function public.duel_invite_json(invite_row public.duel_invites)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  linked_match public.duel_matches;
begin
  if auth.uid() <> invite_row.host_id and auth.uid() is distinct from invite_row.guest_id then
    raise exception 'INVITE_FORBIDDEN';
  end if;
  if invite_row.match_id is not null then
    select * into linked_match from public.duel_matches where id = invite_row.match_id;
  end if;
  return jsonb_build_object(
    'id', invite_row.id,
    'status', invite_row.status,
    'hostName', invite_row.host_name,
    'guestName', invite_row.guest_name,
    'serverNow', extract(epoch from statement_timestamp()) * 1000,
    'expiresAt', extract(epoch from invite_row.expires_at) * 1000,
    'isHost', auth.uid() = invite_row.host_id,
    'isGuest', auth.uid() = invite_row.guest_id,
    'match', case when linked_match.id is null then null else public.duel_match_json(linked_match) end
  );
end;
$$;

create or replace function public.duel_create_invite(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  clean_name text := left(regexp_replace(trim(p_nickname), '[^0-9A-Za-z가-힣 _-]', '', 'g'), 18);
  invite_token text;
  new_invite public.duel_invites;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(clean_name) < 2 then raise exception 'INVALID_NICKNAME'; end if;
  if exists (
    select 1 from public.duel_matches
    where status = 'ready' and expires_at > now() and (player_one = me or player_two = me)
  ) then raise exception 'ACTIVE_MATCH'; end if;

  perform pg_advisory_xact_lock(hashtext('hachan-cat-invite-' || me::text));
  update public.duel_invites set status = 'expired'
    where status = 'waiting' and expires_at <= now();
  update public.duel_invites set status = 'cancelled'
    where host_id = me and status = 'waiting';
  delete from public.duel_queue where user_id = me;

  invite_token := replace(replace(rtrim(encode(gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_');
  insert into public.duel_invites (token_hash, host_id, host_name)
  values (digest(invite_token, 'sha256'), me, clean_name)
  returning * into new_invite;

  return jsonb_build_object('token', invite_token, 'invite', public.duel_invite_json(new_invite));
end;
$$;

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
  if p_token is null or char_length(p_token) not between 20 and 40 then
    return jsonb_build_object('state', 'missing');
  end if;
  select * into current_invite from public.duel_invites
    where token_hash = digest(p_token, 'sha256') for update;
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
  clean_name text := left(regexp_replace(trim(p_nickname), '[^0-9A-Za-z가-힣 _-]', '', 'g'), 18);
  current_invite public.duel_invites;
  new_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(clean_name) < 2 then raise exception 'INVALID_NICKNAME'; end if;
  if p_token is null or char_length(p_token) not between 20 and 40 then
    return jsonb_build_object('state', 'missing');
  end if;

  select * into current_invite from public.duel_invites
    where token_hash = digest(p_token, 'sha256') for update;
  if not found then return jsonb_build_object('state', 'missing'); end if;
  if current_invite.status = 'waiting' and current_invite.expires_at <= now() then
    update public.duel_invites set status = 'expired' where id = current_invite.id returning * into current_invite;
  end if;
  if me = current_invite.host_id then
    return jsonb_build_object('state', 'own', 'invite', public.duel_invite_json(current_invite));
  end if;
  if current_invite.status = 'matched' and me = current_invite.guest_id then
    select * into new_match from public.duel_matches where id = current_invite.match_id;
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match));
  end if;
  if current_invite.status <> 'waiting' then
    return jsonb_build_object('state', case when current_invite.status = 'matched' then 'full' else current_invite.status end);
  end if;
  if exists (
    select 1 from public.duel_matches
    where status = 'ready' and expires_at > now()
      and (player_one in (current_invite.host_id, me) or player_two in (current_invite.host_id, me))
  ) then return jsonb_build_object('state', 'busy'); end if;

  insert into public.duel_matches (
    player_one, player_two, player_one_name, player_two_name,
    level, seed, starts_at, expires_at, opponent_kind, match_source
  ) values (
    current_invite.host_id, me, current_invite.host_name, clean_name,
    3 + floor(random() * 6)::smallint,
    floor(random() * 2000000000)::integer,
    now() + interval '5 seconds', now() + interval '20 seconds', 'live', 'invite'
  ) returning * into new_match;

  update public.duel_invites set
    guest_id = me, guest_name = clean_name, match_id = new_match.id,
    status = 'matched', accepted_at = now()
  where id = current_invite.id returning * into current_invite;
  delete from public.duel_queue where user_id in (current_invite.host_id, me);
  return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match));
end;
$$;

create or replace function public.duel_get_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_invite public.duel_invites;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_invite from public.duel_invites
    where id = p_invite_id and (host_id = me or guest_id = me) for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if current_invite.status = 'waiting' and current_invite.expires_at <= now() then
    update public.duel_invites set status = 'expired' where id = current_invite.id returning * into current_invite;
  end if;
  return public.duel_invite_json(current_invite);
end;
$$;

create or replace function public.duel_cancel_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_invite public.duel_invites;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_invite from public.duel_invites
    where id = p_invite_id and host_id = me for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if current_invite.status = 'waiting' then
    update public.duel_invites set status = 'cancelled' where id = current_invite.id returning * into current_invite;
  end if;
  return public.duel_invite_json(current_invite);
end;
$$;

revoke execute on function public.duel_record_match_profile(uuid, text, boolean, integer, boolean, text) from public, anon, authenticated;
revoke execute on function public.duel_invite_json(public.duel_invites) from public, anon, authenticated;
revoke execute on function public.duel_create_invite(text) from public, anon;
revoke execute on function public.duel_preview_invite(text) from public, anon;
revoke execute on function public.duel_accept_invite(text, text) from public, anon;
revoke execute on function public.duel_get_invite(uuid) from public, anon;
revoke execute on function public.duel_cancel_invite(uuid) from public, anon;

grant execute on function public.duel_create_invite(text) to authenticated;
grant execute on function public.duel_preview_invite(text) to authenticated;
grant execute on function public.duel_accept_invite(text, text) to authenticated;
grant execute on function public.duel_get_invite(uuid) to authenticated;
grant execute on function public.duel_cancel_invite(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.duel_invites;
exception when duplicate_object then null;
end $$;
