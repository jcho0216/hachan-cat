import type { GameLoss, GameResult } from './types';

export type ChallengeTarget = {
  level: number;
  elapsedMs?: number;
  attempts?: number;
  source: 'catch' | 'loss';
};

export type ChallengeComparison = {
  outcome: 'won' | 'tied' | 'lost';
  timeDelta: number;
  attemptDelta: number;
};

const PUBLIC_APP_URL = 'https://hachan-cat.vercel.app/';

function normalizedParams(search: string) {
  const params = new URLSearchParams(search);
  const packed = params.get('queryParams');
  if (!packed) return params;
  try {
    const parsed = JSON.parse(decodeURIComponent(packed)) as Record<string, string | number>;
    Object.entries(parsed).forEach(([key, value]) => params.set(key, String(value)));
  } catch { /* 직접 쿼리만 사용한다. */ }
  return params;
}

export function parseChallengeTarget(search: string): ChallengeTarget | null {
  const params = normalizedParams(search);
  const level = Number(params.get('level'));
  if (!Number.isInteger(level) || level < 1 || level > 10) return null;
  const source = params.get('from') === 'loss' ? 'loss' : 'catch';
  if (source === 'loss') return { level, source };
  const rawTime = Number(params.get('time'));
  const rawAttempts = Number(params.get('attempts'));
  const requiredHits = level === 10 ? 4 : level === 9 ? 2 : 1;
  const minimumTime = Math.max(300, requiredHits * 250);
  const maximumAttempts = requiredHits + 4;
  if (!Number.isInteger(rawTime) || rawTime < minimumTime || rawTime > 15_000
    || !Number.isInteger(rawAttempts) || rawAttempts < requiredHits || rawAttempts > maximumAttempts) return null;
  return {
    level,
    elapsedMs: rawTime,
    attempts: rawAttempts,
    source,
  };
}

export function createCatchChallengeDeepLink(result: GameResult) {
  return `intoss://hachan-cat/challenge?${catchChallengeParams(result).toString()}`;
}

function catchChallengeParams(result: GameResult) {
  return new URLSearchParams({
    level: String(result.level),
    time: String(Math.round(result.elapsedMs)),
    attempts: String(result.attempts),
    from: 'catch',
  });
}

export function createLossChallengeDeepLink(loss: GameLoss) {
  return `intoss://hachan-cat/challenge?${lossChallengeParams(loss).toString()}`;
}

function lossChallengeParams(loss: GameLoss) {
  return new URLSearchParams({ level: String(loss.level), from: 'loss' });
}

export function createCatchChallengeWebUrl(result: GameResult) {
  return `${PUBLIC_APP_URL}?${catchChallengeParams(result).toString()}`;
}

export function createLossChallengeWebUrl(loss: GameLoss) {
  return `${PUBLIC_APP_URL}?${lossChallengeParams(loss).toString()}`;
}

export function challengeDelta(elapsedMs: number, target: ChallengeTarget | null) {
  return target?.elapsedMs === undefined ? null : elapsedMs - target.elapsedMs;
}

export function compareChallengeResult(elapsedMs: number, attempts: number, target: ChallengeTarget | null): ChallengeComparison | null {
  if (target?.elapsedMs === undefined || target.attempts === undefined) return null;
  const timeDelta = Math.round(elapsedMs) - target.elapsedMs;
  const attemptDelta = attempts - target.attempts;
  const outcome = timeDelta < 0 || timeDelta === 0 && attemptDelta < 0
    ? 'won'
    : timeDelta === 0 && attemptDelta === 0 ? 'tied' : 'lost';
  return { outcome, timeDelta, attemptDelta };
}
