import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { DuelJoinResult, DuelLeague, DuelLeaguePlayer, DuelMatch, DuelProfile } from './types';
import { isDuelConfigured } from './config';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const devPlayerKey = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('duel-player')?.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) : '';

let client: SupabaseClient | null = null;
let userId = '';
let sessionPromise: Promise<string> | null = null;
let serverClockOffsetMs = 0;

function supabase() {
  if (!isDuelConfigured) throw new Error('DUEL_NOT_CONFIGURED');
  client ??= createClient(url!, publishableKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, ...(devPlayerKey ? { storageKey: `hachan-duel-auth-${devPlayerKey}` } : {}) },
    realtime: { params: { eventsPerSecond: 8 } },
  });
  return client;
}

const finiteNumber = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const nullableNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function normalizeMatch(value: unknown): DuelMatch {
  if (!value || typeof value !== 'object') throw new Error('INVALID_DUEL_MATCH');
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const level = finiteNumber(row.level);
  const status = row.status;
  const opponentKind = row.opponentKind ?? row.opponent_kind;
  if (!id || !Number.isInteger(level) || level < 3 || level > 8
    || !['ready', 'finished', 'expired'].includes(String(status))
    || !['live', 'ghost'].includes(String(opponentKind))) throw new Error('INVALID_DUEL_MATCH');

  const playerOne = typeof row.player_one === 'string' ? row.player_one : '';
  const isPlayerOne = playerOne === userId;
  const rawDidWin = row.didWin;
  const winnerId = typeof (row.winnerId ?? row.winner_id) === 'string' ? String(row.winnerId ?? row.winner_id) : null;
  const winnerSide = row.winnerSide ?? row.winner_side;
  const serverNow = finiteNumber(row.serverNow, Number.NaN);
  if (Number.isFinite(serverNow)) serverClockOffsetMs = Date.now() - serverNow;
  const rawStartsAt = finiteNumber(row.startsAt, Date.parse(String(row.starts_at ?? '')));
  const rawExpiresAt = finiteNumber(row.expiresAt, Date.parse(String(row.expires_at ?? '')));
  const normalizedStatus = status as DuelMatch['status'];
  const normalizedKind = opponentKind as DuelMatch['opponentKind'];
  const isDraw = row.isDraw === true || (normalizedStatus === 'finished' && normalizedKind === 'live' && winnerId === null);
  const didWin = typeof rawDidWin === 'boolean' ? rawDidWin
    : normalizedStatus !== 'finished' ? null
      : normalizedKind === 'ghost' ? winnerSide === 'player' : winnerId === userId;

  return {
    id,
    level,
    seed: finiteNumber(row.seed),
    startsAt: rawStartsAt + serverClockOffsetMs,
    expiresAt: rawExpiresAt + serverClockOffsetMs,
    status: normalizedStatus,
    opponentKind: normalizedKind,
    opponentName: typeof (row.opponentName ?? (isPlayerOne ? row.player_two_name : row.player_one_name)) === 'string'
      ? String(row.opponentName ?? (isPlayerOne ? row.player_two_name : row.player_one_name)) : '이름 없는 냥손',
    ghostElapsedMs: nullableNumber(row.ghostElapsedMs ?? row.ghost_elapsed_ms),
    winnerId,
    winnerSide: winnerSide === 'player' || winnerSide === 'ghost' ? winnerSide : null,
    winnerElapsedMs: nullableNumber(row.winnerElapsedMs ?? row.winner_elapsed_ms),
    winnerAttempts: nullableNumber(row.winnerAttempts ?? row.winner_attempts),
    winnerAccuracy: nullableNumber(row.winnerAccuracy ?? row.winner_accuracy),
    isDraw,
    didWin,
  };
}

export async function ensureDuelSession() {
  if (userId) return userId;
  if (sessionPromise) return sessionPromise;
  const api = supabase();
  sessionPromise = (async () => {
    const current = await api.auth.getSession();
    if (current.error) throw current.error;
    if (current.data.session) {
      const verified = await api.auth.getUser();
      if (!verified.error && verified.data.user?.id) {
        userId = verified.data.user.id;
        return userId;
      }
      // 서버에서 만료·철회된 익명 계정이면 브라우저의 낡은 세션만 버리고 즉시 재발급한다.
      await api.auth.signOut({ scope: 'local' });
    }
    const signedIn = await api.auth.signInAnonymously();
    if (signedIn.error) throw signedIn.error;
    if (!signedIn.data.session?.user.id) throw new Error('DUEL_AUTH_FAILED');
    userId = signedIn.data.session.user.id;
    return userId;
  })().finally(() => { sessionPromise = null; });
  return sessionPromise;
}

function normalizeJoin(value: unknown): DuelJoinResult {
  if (!value || typeof value !== 'object') throw new Error('INVALID_DUEL_JOIN');
  const result = value as Record<string, unknown>;
  if (result.state === 'matched') return { state: 'matched', match: normalizeMatch(result.match) };
  if (result.state === 'waiting') return { state: 'waiting', onlineCount: Math.max(1, Math.round(finiteNumber(result.onlineCount))) };
  throw new Error('INVALID_DUEL_JOIN');
}

export async function findOrJoinDuel(nickname: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_find_or_join', { p_nickname: nickname });
  if (response.error) throw response.error;
  return normalizeJoin(response.data);
}

export async function startGhostDuel(nickname: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_start_ghost', { p_nickname: nickname });
  if (response.error) throw response.error;
  return normalizeJoin(response.data);
}

export async function claimDuel(matchId: string, elapsedMs: number, attempts: number, accuracy: number) {
  const response = await supabase().rpc('duel_claim', {
    p_match_id: matchId,
    p_elapsed_ms: Math.round(elapsedMs),
    p_attempts: Math.round(attempts),
    p_accuracy: Math.round(accuracy),
  });
  if (response.error) throw response.error;
  return normalizeMatch(response.data);
}

export async function finishGhostDuel(matchId: string) {
  const response = await supabase().rpc('duel_finish_ghost', { p_match_id: matchId });
  if (response.error) throw response.error;
  return normalizeMatch(response.data);
}

export async function forfeitDuel(matchId: string) {
  const response = await supabase().rpc('duel_forfeit', { p_match_id: matchId });
  if (response.error) throw response.error;
  return normalizeMatch(response.data);
}

export async function markDuelFailure(matchId: string) {
  const response = await supabase().rpc('duel_mark_failure', { p_match_id: matchId });
  if (response.error) throw response.error;
  return normalizeMatch(response.data);
}

export async function settleDuelFailure(matchId: string) {
  const response = await supabase().rpc('duel_settle_failure', { p_match_id: matchId });
  if (response.error) throw response.error;
  return normalizeMatch(response.data);
}

export async function leaveDuel() {
  if (!client) return;
  await client.rpc('duel_leave');
}

export async function getDuelProfile(): Promise<DuelProfile> {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_get_profile');
  if (response.error) throw response.error;
  const row = response.data as Record<string, unknown> | null;
  if (!row) throw new Error('INVALID_DUEL_PROFILE');
  return {
    nickname: typeof row.nickname === 'string' ? row.nickname : '',
    matches: Math.max(0, Math.round(finiteNumber(row.matches))),
    wins: Math.max(0, Math.round(finiteNumber(row.wins))),
    losses: Math.max(0, Math.round(finiteNumber(row.losses))),
    currentStreak: Math.max(0, Math.round(finiteNumber(row.currentStreak))),
    bestStreak: Math.max(0, Math.round(finiteNumber(row.bestStreak))),
    fastestWinMs: nullableNumber(row.fastestWinMs),
    ghostWins: Math.max(0, Math.round(finiteNumber(row.ghostWins))),
  };
}

export async function getDuelWeeklyLeague(): Promise<DuelLeague> {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_weekly_league');
  if (response.error) throw response.error;
  const row = response.data as Record<string, unknown> | null;
  if (!row || !Array.isArray(row.players)) throw new Error('INVALID_DUEL_LEAGUE');
  const players = row.players.flatMap((value): DuelLeaguePlayer[] => {
    if (!value || typeof value !== 'object') return [];
    const player = value as Record<string, unknown>;
    if (typeof player.nickname !== 'string') return [];
    return [{
      rank: Math.max(1, Math.round(finiteNumber(player.rank, 1))),
      nickname: player.nickname,
      wins: Math.max(0, Math.round(finiteNumber(player.wins))),
      points: Math.max(0, Math.round(finiteNumber(player.points))),
      fastestWinMs: nullableNumber(player.fastestWinMs),
      isMe: player.isMe === true,
    }];
  });
  return {
    weekStartsAt: finiteNumber(row.weekStartsAt),
    players,
    myRank: nullableNumber(row.myRank),
  };
}

export function subscribeToDuel(matchId: string, onMatch: (match: DuelMatch) => void) {
  const channel = supabase().channel(`duel-match-${matchId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duel_matches', filter: `id=eq.${matchId}` }, (payload) => {
      try { onMatch(normalizeMatch(payload.new)); } catch { /* 손상된 실시간 이벤트는 폴백 UI가 처리한다. */ }
    })
    .subscribe();
  return () => { void supabase().removeChannel(channel); };
}

export function connectDuelPresence(onCount: (count: number) => void) {
  if (!isDuelConfigured) return () => undefined;
  let channel: RealtimeChannel | null = null;
  let disposed = false;
  void ensureDuelSession().then(() => {
    if (disposed) return;
    channel = supabase().channel('hachan-cat-duel-lobby', { config: { presence: { key: userId } } });
    channel.on('presence', { event: 'sync' }, () => onCount(Object.keys(channel?.presenceState() ?? {}).length));
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void channel?.track({ joinedAt: new Date().toISOString() });
    });
  }).catch(() => onCount(0));
  return () => { disposed = true; if (channel) void supabase().removeChannel(channel); };
}
