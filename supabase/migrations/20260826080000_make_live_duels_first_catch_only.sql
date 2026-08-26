-- FIRST_CATCH_ONLY: live multiplayer ends only when one player catches the cat.

alter table public.duel_matches drop constraint if exists duel_matches_winner_elapsed_ms_check;
alter table public.duel_matches drop constraint if exists duel_matches_winner_attempts_check;
alter table public.duel_matches alter column winner_attempts type integer using winner_attempts::integer;
alter table public.duel_matches
  add constraint duel_matches_winner_elapsed_ms_check check (winner_elapsed_ms is null or winner_elapsed_ms >= 450),
  add constraint duel_matches_winner_attempts_check check (winner_attempts is null or winner_attempts >= 1);

alter table public.duel_runs drop constraint if exists duel_runs_elapsed_ms_check;
alter table public.duel_runs drop constraint if exists duel_runs_attempts_check;
alter table public.duel_runs alter column attempts type integer using attempts::integer;
alter table public.duel_runs
  add constraint duel_runs_elapsed_ms_check check (elapsed_ms >= 450),
  add constraint duel_runs_attempts_check check (attempts >= 1);

alter table public.duel_profiles drop constraint if exists duel_profiles_fastest_win_ms_check;
alter table public.duel_profiles
  add constraint duel_profiles_fastest_win_ms_check check (fastest_win_ms is null or fastest_win_ms >= 450);

create or replace function public.duel_keep_live_match_open()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.opponent_kind = 'live' and new.status = 'ready' then
    new.expires_at := greatest(new.expires_at, new.starts_at + interval '24 hours');
  end if;
  return new;
end;
$$;

drop trigger if exists duel_matches_keep_live_match_open on public.duel_matches;
create trigger duel_matches_keep_live_match_open
before insert or update of starts_at, expires_at, status, opponent_kind on public.duel_matches
for each row execute function public.duel_keep_live_match_open();

update public.duel_matches
set expires_at = greatest(expires_at, starts_at + interval '24 hours')
where opponent_kind = 'live' and status = 'ready';

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
  if p_elapsed_ms < 450
    or p_attempts < 1
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
    if p_elapsed_ms > 15000 or p_attempts > 5 then raise exception 'INVALID_RESULT'; end if;
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

-- Keep these RPCs as authenticated no-ops so an older client cannot turn a
-- timeout or fifth miss into a win, loss, or draw while users update.
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
  where id = p_match_id and (player_one = me or player_two = me);
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
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
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_match from public.duel_matches
  where id = p_match_id and (player_one = me or player_two = me);
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  return public.duel_match_json(current_match);
end;
$$;

revoke execute on function public.duel_claim(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.duel_mark_failure(uuid) from public, anon;
revoke execute on function public.duel_settle_failure(uuid) from public, anon;
grant execute on function public.duel_claim(uuid, integer, integer, integer) to authenticated;
grant execute on function public.duel_mark_failure(uuid) to authenticated;
grant execute on function public.duel_settle_failure(uuid) to authenticated;
