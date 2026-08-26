create extension if not exists pgcrypto;

create table if not exists public.duel_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 18),
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

create table if not exists public.duel_matches (
  id uuid primary key default gen_random_uuid(),
  player_one uuid not null references auth.users(id) on delete cascade,
  player_two uuid references auth.users(id) on delete set null,
  player_one_name text not null,
  player_two_name text not null,
  level smallint not null check (level between 3 and 8),
  seed integer not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'ready' check (status in ('ready', 'finished', 'expired')),
  opponent_kind text not null default 'live' check (opponent_kind in ('live', 'ghost')),
  ghost_elapsed_ms integer check (ghost_elapsed_ms between 450 and 15000),
  winner_id uuid references auth.users(id) on delete set null,
  winner_side text check (winner_side in ('player', 'ghost')),
  winner_elapsed_ms integer check (winner_elapsed_ms between 450 and 15000),
  winner_attempts smallint check (winner_attempts between 1 and 5),
  winner_accuracy smallint check (winner_accuracy between 0 and 100),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.duel_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  level smallint not null check (level between 3 and 8),
  seed integer not null,
  elapsed_ms integer not null check (elapsed_ms between 450 and 15000),
  attempts smallint not null check (attempts between 1 and 5),
  accuracy smallint not null check (accuracy between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.duel_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 18),
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  fastest_win_ms integer check (fastest_win_ms between 450 and 15000),
  ghost_wins integer not null default 0 check (ghost_wins >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists duel_queue_waiting_idx on public.duel_queue (joined_at);
create index if not exists duel_matches_player_one_idx on public.duel_matches (player_one, created_at desc);
create index if not exists duel_matches_player_two_idx on public.duel_matches (player_two, created_at desc);
create index if not exists duel_runs_recent_idx on public.duel_runs (created_at desc);
create index if not exists duel_profiles_wins_idx on public.duel_profiles (wins desc, fastest_win_ms);

alter table public.duel_queue enable row level security;
alter table public.duel_matches enable row level security;
alter table public.duel_runs enable row level security;
alter table public.duel_profiles enable row level security;

create policy "players can read their duel matches"
on public.duel_matches for select
to authenticated
using (auth.uid() = player_one or auth.uid() = player_two);

revoke all on public.duel_queue from anon, authenticated;
revoke all on public.duel_matches from anon, authenticated;
revoke all on public.duel_runs from anon, authenticated;
revoke all on public.duel_profiles from anon, authenticated;
grant select on public.duel_matches to authenticated;
grant select on public.duel_profiles to authenticated;

create policy "players can read their duel profile"
on public.duel_profiles for select
to authenticated
using (auth.uid() = user_id);

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
    'opponentName', case when auth.uid() = match_row.player_one then match_row.player_two_name else match_row.player_one_name end,
    'ghostElapsedMs', match_row.ghost_elapsed_ms,
    'winnerId', match_row.winner_id,
    'winnerSide', match_row.winner_side,
    'winnerElapsedMs', match_row.winner_elapsed_ms,
    'winnerAttempts', match_row.winner_attempts,
    'winnerAccuracy', match_row.winner_accuracy,
    'didWin', case
      when match_row.status <> 'finished' then null
      when match_row.opponent_kind = 'ghost' then match_row.winner_side = 'player'
      else match_row.winner_id = auth.uid()
    end
  );
$$;

create or replace function public.duel_record_profile(
  p_user_id uuid, p_nickname text, p_won boolean, p_elapsed_ms integer default null, p_ghost_win boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.duel_profiles (
    user_id, nickname, matches, wins, losses, current_streak, best_streak, fastest_win_ms, ghost_wins
  ) values (
    p_user_id, p_nickname, 1, case when p_won then 1 else 0 end, case when p_won then 0 else 1 end,
    case when p_won then 1 else 0 end, case when p_won then 1 else 0 end,
    case when p_won then p_elapsed_ms else null end, case when p_ghost_win then 1 else 0 end
  )
  on conflict (user_id) do update set
    nickname = excluded.nickname,
    matches = duel_profiles.matches + 1,
    wins = duel_profiles.wins + excluded.wins,
    losses = duel_profiles.losses + excluded.losses,
    current_streak = case when p_won then duel_profiles.current_streak + 1 else 0 end,
    best_streak = greatest(duel_profiles.best_streak, case when p_won then duel_profiles.current_streak + 1 else duel_profiles.best_streak end),
    fastest_win_ms = case when p_won then least(coalesce(duel_profiles.fastest_win_ms, p_elapsed_ms), p_elapsed_ms) else duel_profiles.fastest_win_ms end,
    ghost_wins = duel_profiles.ghost_wins + excluded.ghost_wins,
    updated_at = now();
$$;

create or replace function public.duel_find_or_join(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := left(regexp_replace(trim(p_nickname), '[^0-9A-Za-z가-힣 _-]', '', 'g'), 18);
  existing_match public.duel_matches;
  opponent public.duel_queue;
  new_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(clean_name) < 2 then raise exception 'INVALID_NICKNAME'; end if;

  perform pg_advisory_xact_lock(hashtext('hachan-cat-duel-queue'));
  delete from public.duel_queue where heartbeat_at < now() - interval '20 seconds';
  delete from public.duel_runs where created_at < now() - interval '8 days';
  delete from public.duel_matches
    where (status in ('finished', 'expired') and created_at < now() - interval '8 days')
       or (status = 'ready' and expires_at < now() - interval '1 day');
  update public.duel_matches set status = 'expired'
    where status = 'ready' and expires_at < now();

  select * into existing_match
  from public.duel_matches
  where status = 'ready'
    and expires_at > now()
    and (player_one = me or player_two = me)
  order by created_at desc limit 1;

  if found then
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(existing_match));
  end if;

  select * into opponent
  from public.duel_queue
  where user_id <> me and heartbeat_at >= now() - interval '20 seconds'
  order by joined_at
  for update skip locked
  limit 1;

  if found then
    insert into public.duel_matches (
      player_one, player_two, player_one_name, player_two_name,
      level, seed, starts_at, expires_at
    ) values (
      opponent.user_id, me, opponent.nickname, clean_name,
      3 + floor(random() * 6)::smallint,
      floor(random() * 2000000000)::integer,
      now() + interval '3 seconds', now() + interval '18 seconds'
    ) returning * into new_match;
    delete from public.duel_queue where user_id in (opponent.user_id, me);
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match));
  end if;

  insert into public.duel_queue (user_id, nickname, joined_at, heartbeat_at)
  values (me, clean_name, now(), now())
  on conflict (user_id) do update
    set nickname = excluded.nickname, heartbeat_at = now();

  return jsonb_build_object(
    'state', 'waiting',
    'onlineCount', (select count(*) from public.duel_queue where heartbeat_at >= now() - interval '20 seconds')
  );
end;
$$;

create or replace function public.duel_start_ghost(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := left(regexp_replace(trim(p_nickname), '[^0-9A-Za-z가-힣 _-]', '', 'g'), 18);
  ghost public.duel_runs;
  new_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('hachan-cat-duel-queue'));

  select * into new_match from public.duel_matches
  where status = 'ready' and expires_at > now() and (player_one = me or player_two = me)
  order by created_at desc limit 1;
  if found then
    delete from public.duel_queue where user_id = me;
    return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match));
  end if;

  select * into ghost from (
    select * from public.duel_runs
    where created_at >= now() - interval '7 days' and user_id <> me
    order by created_at desc limit 30
  ) recent order by random() limit 1;

  insert into public.duel_matches (
    player_one, player_one_name, player_two_name, level, seed,
    starts_at, expires_at, opponent_kind, ghost_elapsed_ms
  ) values (
    me, clean_name, coalesce(ghost.nickname, '연습생 냥손'),
    coalesce(ghost.level, 4), coalesce(ghost.seed, floor(random() * 2000000000)::integer),
    now() + interval '3 seconds', now() + interval '18 seconds', 'ghost',
    coalesce(ghost.elapsed_ms, 6800)
  ) returning * into new_match;
  delete from public.duel_queue where user_id = me;
  return jsonb_build_object('state', 'matched', 'match', public.duel_match_json(new_match));
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
    perform public.duel_record_profile(
      me, current_match.player_one_name, current_match.winner_side = 'player', p_elapsed_ms,
      current_match.winner_side = 'player'
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
      perform public.duel_record_profile(
        me,
        case when current_match.player_one = me then current_match.player_one_name else current_match.player_two_name end,
        true, p_elapsed_ms, false
      );
      perform public.duel_record_profile(
        case when current_match.player_one = me then current_match.player_two else current_match.player_one end,
        case when current_match.player_one = me then current_match.player_two_name else current_match.player_one_name end,
        false, null, false
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

create or replace function public.duel_leave()
returns void
language sql
security definer
set search_path = public
as $$ delete from public.duel_queue where user_id = auth.uid(); $$;

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
  perform public.duel_record_profile(me, current_match.player_one_name, false, null, false);
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
  perform public.duel_record_profile(
    me,
    case when current_match.player_one = me then current_match.player_one_name else current_match.player_two_name end,
    false, null, false
  );
  if current_match.opponent_kind = 'live' and other_player is not null then
    perform public.duel_record_profile(
      other_player,
      case when current_match.player_one = me then current_match.player_two_name else current_match.player_one_name end,
      true, null, false
    );
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
    'ghostWins', coalesce(profile.ghost_wins, 0)
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

revoke execute on function public.duel_record_profile(uuid, text, boolean, integer, boolean) from public, anon, authenticated;
revoke execute on function public.duel_match_json(public.duel_matches) from public, anon;
revoke execute on function public.duel_find_or_join(text) from public, anon;
revoke execute on function public.duel_start_ghost(text) from public, anon;
revoke execute on function public.duel_claim(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.duel_leave() from public, anon;
revoke execute on function public.duel_finish_ghost(uuid) from public, anon;
revoke execute on function public.duel_forfeit(uuid) from public, anon;
revoke execute on function public.duel_get_profile() from public, anon;
revoke execute on function public.duel_weekly_league() from public, anon;

grant execute on function public.duel_find_or_join(text) to authenticated;
grant execute on function public.duel_start_ghost(text) to authenticated;
grant execute on function public.duel_claim(uuid, integer, integer, integer) to authenticated;
grant execute on function public.duel_leave() to authenticated;
grant execute on function public.duel_finish_ghost(uuid) to authenticated;
grant execute on function public.duel_forfeit(uuid) to authenticated;
grant execute on function public.duel_get_profile() to authenticated;
grant execute on function public.duel_weekly_league() to authenticated;

alter publication supabase_realtime add table public.duel_matches;
