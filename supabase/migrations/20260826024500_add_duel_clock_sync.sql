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

revoke execute on function public.duel_match_json(public.duel_matches) from public, anon;
