-- BOSS_HIT_TIEBREAK: multi-hit live rounds last at most 60 seconds.
-- A full catch still wins immediately; otherwise the higher hit count wins.

alter table public.duel_matches
  add column if not exists player_one_hits smallint not null default 0,
  add column if not exists player_two_hits smallint not null default 0,
  add column if not exists result_kind text;

alter table public.duel_matches drop constraint if exists duel_matches_player_one_hits_check;
alter table public.duel_matches drop constraint if exists duel_matches_player_two_hits_check;
alter table public.duel_matches drop constraint if exists duel_matches_result_kind_check;
alter table public.duel_matches
  add constraint duel_matches_player_one_hits_check check (player_one_hits between 0 and 4),
  add constraint duel_matches_player_two_hits_check check (player_two_hits between 0 and 4),
  add constraint duel_matches_result_kind_check check (result_kind is null or result_kind in ('catch', 'hits', 'draw'));

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
    'roundDeadline', case
      when match_row.opponent_kind = 'live' and match_row.level >= 9
        then extract(epoch from match_row.starts_at + interval '60 seconds') * 1000
      else null
    end,
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
    'myHits', case when auth.uid() = match_row.player_one then match_row.player_one_hits else match_row.player_two_hits end,
    'opponentHits', case when auth.uid() = match_row.player_one then match_row.player_two_hits else match_row.player_one_hits end,
    'resultKind', match_row.result_kind,
    'isDraw', match_row.status = 'finished' and match_row.opponent_kind = 'live' and match_row.winner_id is null,
    'didWin', case
      when match_row.status <> 'finished' then null
      when match_row.opponent_kind = 'ghost' then match_row.winner_side = 'player'
      else match_row.winner_id = auth.uid()
    end
  );
$$;

create or replace function public.duel_report_boss_hit(p_match_id uuid, p_hits integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
  required_hits integer;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into current_match
  from public.duel_matches
  where id = p_match_id and opponent_kind = 'live' and (player_one = me or player_two = me)
  for update;

  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;
  if current_match.level < 9 then raise exception 'NOT_BOSS_ROUND'; end if;

  required_hits := case when current_match.level = 9 then 2 else 4 end;
  if p_hits < 1 or p_hits >= required_hits then raise exception 'INVALID_HIT_PROGRESS'; end if;
  if now() < current_match.starts_at then raise exception 'TOO_EARLY'; end if;
  if now() > current_match.starts_at + interval '60 seconds 800 milliseconds' then raise exception 'ROUND_ENDED'; end if;

  update public.duel_matches set
    player_one_hits = case when player_one = me then greatest(player_one_hits, p_hits) else player_one_hits end,
    player_two_hits = case when player_two = me then greatest(player_two_hits, p_hits) else player_two_hits end
  where id = p_match_id
  returning * into current_match;

  return public.duel_match_json(current_match);
end;
$$;

create or replace function public.duel_settle_boss_round(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_match public.duel_matches;
  winning_player uuid;
  winning_name text;
  losing_player uuid;
  losing_name text;
  winning_hits integer;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into current_match
  from public.duel_matches
  where id = p_match_id and opponent_kind = 'live' and (player_one = me or player_two = me)
  for update;

  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if current_match.status <> 'ready' then return public.duel_match_json(current_match); end if;
  if current_match.level < 9 then raise exception 'NOT_BOSS_ROUND'; end if;
  if now() < current_match.starts_at + interval '60 seconds 800 milliseconds' then raise exception 'SETTLEMENT_PENDING'; end if;

  if current_match.player_one_hits > current_match.player_two_hits then
    winning_player := current_match.player_one;
    winning_name := current_match.player_one_name;
    losing_player := current_match.player_two;
    losing_name := current_match.player_two_name;
    winning_hits := current_match.player_one_hits;
  elsif current_match.player_two_hits > current_match.player_one_hits then
    winning_player := current_match.player_two;
    winning_name := current_match.player_two_name;
    losing_player := current_match.player_one;
    losing_name := current_match.player_one_name;
    winning_hits := current_match.player_two_hits;
  end if;

  update public.duel_matches set
    status = 'finished',
    winner_id = winning_player,
    winner_side = case when winning_player is null then null else 'player' end,
    winner_elapsed_ms = case when winning_player is null then null else 60000 end,
    winner_attempts = case when winning_player is null then null else greatest(1, winning_hits) end,
    winner_accuracy = case when winning_player is null then null else 0 end,
    result_kind = case when winning_player is null then 'draw' else 'hits' end,
    finished_at = now()
  where id = p_match_id and status = 'ready'
  returning * into current_match;

  if winning_player is not null then
    perform public.duel_record_match_profile(
      winning_player, winning_name, true, 60000, false, current_match.match_source
    );
    perform public.duel_record_match_profile(
      losing_player, losing_name, false, null, false, current_match.match_source
    );
  end if;

  return public.duel_match_json(current_match);
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
  required_hits integer;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_elapsed_ms < 450 or p_attempts < 1 or p_accuracy not between 0 and 100 then
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
      result_kind = 'catch',
      finished_at = now()
    where id = p_match_id returning * into current_match;
    perform public.duel_record_match_profile(
      me, current_match.player_one_name, current_match.winner_side = 'player', p_elapsed_ms,
      current_match.winner_side = 'player', current_match.match_source
    );
  else
    if current_match.level >= 9 then
      if p_elapsed_ms > 60000 or now() > current_match.starts_at + interval '60 seconds 800 milliseconds' then
        raise exception 'ROUND_ENDED';
      end if;
      required_hits := case when current_match.level = 9 then 2 else 4 end;
    else
      required_hits := 1;
    end if;

    update public.duel_matches set
      status = 'finished', winner_id = me, winner_side = 'player',
      winner_elapsed_ms = p_elapsed_ms, winner_attempts = p_attempts,
      winner_accuracy = p_accuracy, result_kind = 'catch',
      player_one_hits = case when player_one = me then required_hits else player_one_hits end,
      player_two_hits = case when player_two = me then required_hits else player_two_hits end,
      finished_at = now()
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

revoke all on function public.duel_report_boss_hit(uuid, integer) from public, anon;
grant execute on function public.duel_report_boss_hit(uuid, integer) to authenticated;
revoke all on function public.duel_settle_boss_round(uuid) from public, anon;
grant execute on function public.duel_settle_boss_round(uuid) to authenticated;
revoke all on function public.duel_claim(uuid, integer, integer, integer) from public, anon;
grant execute on function public.duel_claim(uuid, integer, integer, integer) to authenticated;
revoke all on function public.duel_match_json(public.duel_matches) from public, anon, authenticated;

notify pgrst, 'reload schema';
