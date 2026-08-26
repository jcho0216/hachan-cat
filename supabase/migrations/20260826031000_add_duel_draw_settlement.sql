alter table public.duel_matches
  add column if not exists player_one_failed_at timestamptz,
  add column if not exists player_two_failed_at timestamptz;

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
    'isDraw', match_row.status = 'finished' and match_row.opponent_kind = 'live' and match_row.winner_id is null,
    'didWin', case
      when match_row.status <> 'finished' then null
      when match_row.opponent_kind = 'ghost' then match_row.winner_side = 'player'
      else match_row.winner_id = auth.uid()
    end
  );
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
    perform public.duel_record_profile(me, current_match.player_one_name, false, null, false);
    return public.duel_match_json(current_match);
  end if;

  update public.duel_matches set
    player_one_failed_at = case when player_one = me then coalesce(player_one_failed_at, now()) else player_one_failed_at end,
    player_two_failed_at = case when player_two = me then coalesce(player_two_failed_at, now()) else player_two_failed_at end
  where id = p_match_id returning * into current_match;

  if current_match.player_one_failed_at is not null and current_match.player_two_failed_at is not null then
    update public.duel_matches set status = 'finished', winner_id = null, winner_side = null, finished_at = now()
    where id = p_match_id and status = 'ready' returning * into current_match;
    perform public.duel_record_profile(current_match.player_one, current_match.player_one_name, false, null, false);
    perform public.duel_record_profile(current_match.player_two, current_match.player_two_name, false, null, false);
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
    perform public.duel_record_profile(current_match.player_one, current_match.player_one_name, false, null, false);
    perform public.duel_record_profile(current_match.player_two, current_match.player_two_name, false, null, false);
  else
    winning_player := case when current_match.player_one_failed_at is null then current_match.player_one else current_match.player_two end;
    winning_name := case when current_match.player_one_failed_at is null then current_match.player_one_name else current_match.player_two_name end;
    losing_player := case when current_match.player_one_failed_at is not null then current_match.player_one else current_match.player_two end;
    losing_name := case when current_match.player_one_failed_at is not null then current_match.player_one_name else current_match.player_two_name end;
    update public.duel_matches set status = 'finished', winner_id = winning_player, winner_side = 'player', finished_at = now()
    where id = p_match_id and status = 'ready' returning * into current_match;
    perform public.duel_record_profile(winning_player, winning_name, true, null, false);
    perform public.duel_record_profile(losing_player, losing_name, false, null, false);
  end if;
  return public.duel_match_json(current_match);
end;
$$;

revoke execute on function public.duel_match_json(public.duel_matches) from public, anon;
revoke execute on function public.duel_mark_failure(uuid) from public, anon;
revoke execute on function public.duel_settle_failure(uuid) from public, anon;
grant execute on function public.duel_mark_failure(uuid) to authenticated;
grant execute on function public.duel_settle_failure(uuid) to authenticated;
