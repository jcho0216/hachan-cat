import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { DuelGesture, DuelInvite, DuelInviteCreation, DuelInvitePreview, DuelJoinResult, DuelLeague, DuelLeaguePlayer, DuelMatch, DuelProfile, DuelSession } from './types';
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
  const matchSource = row.matchSource ?? row.match_source ?? (opponentKind === 'ghost' ? 'ghost' : 'random');
  if (!id || !Number.isInteger(level) || level < 1 || level > 10
    || !['ready', 'finished', 'expired'].includes(String(status))
    || !['live', 'ghost'].includes(String(opponentKind))
    || !['random', 'ghost', 'invite'].includes(String(matchSource))) throw new Error('INVALID_DUEL_MATCH');

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
  const rawResultKind = row.resultKind ?? row.result_kind;
  const resultKind = ['catch', 'hits', 'draw'].includes(String(rawResultKind)) ? rawResultKind as DuelMatch['resultKind'] : null;
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
    matchSource: matchSource as DuelMatch['matchSource'],
    sessionId: typeof (row.sessionId ?? row.session_id) === 'string' ? String(row.sessionId ?? row.session_id) : null,
    sessionRound: nullableNumber(row.sessionRound ?? row.session_round),
    opponentName: typeof (row.opponentName ?? (isPlayerOne ? row.player_two_name : row.player_one_name)) === 'string'
      ? String(row.opponentName ?? (isPlayerOne ? row.player_two_name : row.player_one_name)) : '이름 없는 냥손',
    ghostElapsedMs: nullableNumber(row.ghostElapsedMs ?? row.ghost_elapsed_ms),
    winnerId,
    winnerSide: winnerSide === 'player' || winnerSide === 'ghost' ? winnerSide : null,
    winnerElapsedMs: nullableNumber(row.winnerElapsedMs ?? row.winner_elapsed_ms),
    winnerAttempts: nullableNumber(row.winnerAttempts ?? row.winner_attempts),
    winnerAccuracy: nullableNumber(row.winnerAccuracy ?? row.winner_accuracy),
    myHits: Math.max(0, Math.round(finiteNumber(row.myHits ?? (isPlayerOne ? row.player_one_hits : row.player_two_hits)))),
    opponentHits: Math.max(0, Math.round(finiteNumber(row.opponentHits ?? (isPlayerOne ? row.player_two_hits : row.player_one_hits)))),
    resultKind,
    roundDeadline: nullableNumber(row.roundDeadline) === null
      ? normalizedKind === 'live' && level >= 9 ? rawStartsAt + serverClockOffsetMs + 60_000 : null
      : nullableNumber(row.roundDeadline)! + serverClockOffsetMs,
    isDraw,
    didWin,
  };
}

function normalizeSession(value: unknown): DuelSession {
  if (!value || typeof value !== 'object') throw new Error('INVALID_DUEL_SESSION');
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const status = String(row.status);
  const selectedLevel = finiteNumber(row.selectedLevel ?? row.selected_level);
  if (!id || !['playing', 'choosing', 'closed'].includes(status) || !Number.isInteger(selectedLevel) || selectedLevel < 1 || selectedLevel > 10) throw new Error('INVALID_DUEL_SESSION');
  const serverNow = finiteNumber(row.serverNow, Number.NaN);
  if (Number.isFinite(serverNow)) serverClockOffsetMs = Date.now() - serverNow;
  const rawDeadline = nullableNumber(row.choiceDeadline ?? row.choice_deadline);
  return {
    id,
    source: row.source === 'random' ? 'random' : 'invite',
    status: status as DuelSession['status'],
    round: Math.max(1, Math.round(finiteNumber(row.round, 1))),
    selectedLevel,
    choiceDeadline: rawDeadline === null ? null : rawDeadline + serverClockOffsetMs,
    myScore: Math.max(0, Math.round(finiteNumber(row.myScore))),
    opponentScore: Math.max(0, Math.round(finiteNumber(row.opponentScore))),
    hostScore: Math.max(0, Math.round(finiteNumber(row.hostScore))),
    guestScore: Math.max(0, Math.round(finiteNumber(row.guestScore))),
    chooserIsMe: row.chooserIsMe === true,
    chooserName: typeof row.chooserName === 'string' ? row.chooserName : '',
    opponentName: typeof row.opponentName === 'string' ? row.opponentName : '이름 없는 냥손',
    isHost: row.isHost === true,
    leftByMe: row.leftByMe === true,
    opponentLeft: row.opponentLeft === true,
    lastWinnerIsMe: row.lastWinnerIsMe === true,
    lastTauntId: nullableNumber(row.lastTauntId),
    lastTauntIsMine: row.lastTauntIsMine === true,
    match: row.match ? normalizeMatch(row.match) : null,
  };
}

function normalizeInvite(value: unknown): DuelInvite {
  if (!value || typeof value !== 'object') throw new Error('INVALID_DUEL_INVITE');
  const row = value as Record<string, unknown>;
  const status = String(row.status);
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id || !['waiting', 'matched', 'cancelled', 'expired'].includes(status)) throw new Error('INVALID_DUEL_INVITE');
  const serverNow = finiteNumber(row.serverNow, Number.NaN);
  if (Number.isFinite(serverNow)) serverClockOffsetMs = Date.now() - serverNow;
  return {
    id,
    status: status as DuelInvite['status'],
    hostName: typeof row.hostName === 'string' ? row.hostName : '이름 없는 냥손',
    guestName: typeof row.guestName === 'string' ? row.guestName : null,
    selectedLevel: Math.max(1, Math.min(10, Math.round(finiteNumber(row.selectedLevel, 3)))),
    expiresAt: finiteNumber(row.expiresAt) + serverClockOffsetMs,
    isHost: row.isHost === true,
    isGuest: row.isGuest === true,
    match: row.match ? normalizeMatch(row.match) : null,
    session: row.session ? normalizeSession(row.session) : null,
  };
}

function normalizeInvitePreview(value: unknown): DuelInvitePreview {
  if (!value || typeof value !== 'object') throw new Error('INVALID_DUEL_INVITE_PREVIEW');
  const row = value as Record<string, unknown>;
  const rawState = String(row.state);
  const allowed = ['ready', 'waiting', 'matched', 'own', 'expired', 'cancelled', 'full', 'busy', 'missing'];
  if (!allowed.includes(rawState)) throw new Error('INVALID_DUEL_INVITE_PREVIEW');
  const invite = row.invite ? normalizeInvite(row.invite) : null;
  const serverNow = finiteNumber(row.serverNow, Number.NaN);
  if (Number.isFinite(serverNow)) serverClockOffsetMs = Date.now() - serverNow;
  return {
    state: invite?.isHost && invite.status === 'waiting' ? 'own' : rawState as DuelInvitePreview['state'],
    hostName: invite?.hostName ?? (typeof row.hostName === 'string' ? row.hostName : '이름 없는 냥손'),
    selectedLevel: invite?.selectedLevel ?? Math.max(1, Math.min(10, Math.round(finiteNumber(row.selectedLevel, 3)))),
    expiresAt: invite?.expiresAt ?? finiteNumber(row.expiresAt) + serverClockOffsetMs,
    invite,
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

export async function createDuelInvite(nickname: string, level: number): Promise<DuelInviteCreation> {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_create_invite', { p_nickname: nickname, p_level: Math.round(level) });
  if (response.error) throw response.error;
  const row = response.data as Record<string, unknown> | null;
  if (!row || typeof row.token !== 'string') throw new Error('INVALID_DUEL_INVITE_CREATION');
  return { token: row.token, invite: normalizeInvite(row.invite) };
}

export async function previewDuelInvite(token: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_preview_invite', { p_token: token });
  if (response.error) throw response.error;
  return normalizeInvitePreview(response.data);
}

export async function acceptDuelInvite(token: string, nickname: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_accept_invite', { p_token: token, p_nickname: nickname });
  if (response.error) throw response.error;
  const preview = normalizeInvitePreview(response.data);
  const row = response.data as Record<string, unknown>;
  return { ...preview, match: row.match ? normalizeMatch(row.match) : preview.invite?.match ?? null, session: row.session ? normalizeSession(row.session) : preview.invite?.session ?? null };
}

export async function getDuelSession(sessionId: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_get_session', { p_session_id: sessionId });
  if (response.error) throw response.error;
  return normalizeSession(response.data);
}

export async function getActiveDuelSession() {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_get_active_session');
  if (response.error) throw response.error;
  return response.data ? normalizeSession(response.data) : null;
}

export async function chooseDuelSessionCat(sessionId: string, level?: number) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_choose_session_cat', { p_session_id: sessionId, p_level: level === undefined ? null : Math.round(level) });
  if (response.error) throw response.error;
  return normalizeSession(response.data);
}

export async function sendDuelSessionTaunt(sessionId: string, tauntId: number) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_send_session_taunt', { p_session_id: sessionId, p_taunt_id: Math.round(tauntId) });
  if (response.error) throw response.error;
  return normalizeSession(response.data);
}

export async function leaveDuelSession(sessionId: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_leave_session', { p_session_id: sessionId });
  if (response.error) throw response.error;
  return normalizeSession(response.data);
}

export async function getDuelInvite(inviteId: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_get_invite', { p_invite_id: inviteId });
  if (response.error) throw response.error;
  return normalizeInvite(response.data);
}

export async function cancelDuelInvite(inviteId: string) {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_cancel_invite', { p_invite_id: inviteId });
  if (response.error) throw response.error;
  return normalizeInvite(response.data);
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

export async function reportDuelBossHit(matchId: string, hits: number) {
  const response = await supabase().rpc('duel_report_boss_hit', {
    p_match_id: matchId,
    p_hits: Math.round(hits),
  });
  if (response.error) throw response.error;
  return normalizeMatch(response.data);
}

export async function settleDuelBossRound(matchId: string) {
  const response = await supabase().rpc('duel_settle_boss_round', { p_match_id: matchId });
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

function normalizeProfile(value: unknown): DuelProfile {
  const row = value as Record<string, unknown> | null;
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
    friendMatches: Math.max(0, Math.round(finiteNumber(row.friendMatches))),
    friendWins: Math.max(0, Math.round(finiteNumber(row.friendWins))),
    friendLosses: Math.max(0, Math.round(finiteNumber(row.friendLosses))),
  };
}

export async function setDuelNickname(nickname: string): Promise<DuelProfile> {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_set_nickname', { p_nickname: nickname });
  if (response.error) throw response.error;
  return normalizeProfile(response.data);
}

export async function getDuelProfile(): Promise<DuelProfile> {
  await ensureDuelSession();
  const response = await supabase().rpc('duel_get_profile');
  if (response.error) throw response.error;
  return normalizeProfile(response.data);
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

export function connectDuelGestures(matchId: string, onGesture: (gesture: DuelGesture) => void) {
  let connected = false;
  const channel = supabase().channel(`duel-gestures-${matchId}`, { config: { broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'gesture' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return;
      const row = payload as Record<string, unknown>;
      const kind = row.kind;
      const x = finiteNumber(row.x, Number.NaN);
      const y = finiteNumber(row.y, Number.NaN);
      const vx = Math.min(180, Math.max(-180, finiteNumber(row.vx)));
      const vy = Math.min(180, Math.max(-180, finiteNumber(row.vy)));
      if (!['start', 'move', 'release'].includes(String(kind)) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      onGesture({ kind: kind as DuelGesture['kind'], x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)), vx, vy });
    })
    .subscribe((status) => { connected = status === 'SUBSCRIBED'; });

  return {
    send(gesture: DuelGesture) {
      if (!connected) return;
      void channel.send({ type: 'broadcast', event: 'gesture', payload: gesture });
    },
    unsubscribe() { connected = false; void supabase().removeChannel(channel); },
  };
}

export function subscribeToDuelInvite(inviteId: string, onChange: () => void) {
  const channel = supabase().channel(`duel-invite-${inviteId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duel_invites', filter: `id=eq.${inviteId}` }, onChange)
    .subscribe();
  return () => { void supabase().removeChannel(channel); };
}

export function subscribeToDuelSession(sessionId: string, onChange: () => void) {
  const channel = supabase().channel(`duel-session-${sessionId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duel_sessions', filter: `id=eq.${sessionId}` }, onChange)
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
