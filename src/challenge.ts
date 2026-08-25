import type { GameLoss, GameResult } from './types';

export type ChallengeTarget = {
  level: number;
  elapsedMs?: number;
  attempts?: number;
  source: 'catch' | 'loss';
};

const clampInteger = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));
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
  if (!Number.isFinite(level) || level < 1 || level > 10) return null;
  const rawTime = Number(params.get('time'));
  const rawAttempts = Number(params.get('attempts'));
  return {
    level: clampInteger(level, 1, 10),
    elapsedMs: Number.isFinite(rawTime) && rawTime >= 300 && rawTime <= 15_000 ? clampInteger(rawTime, 300, 15_000) : undefined,
    attempts: Number.isFinite(rawAttempts) && rawAttempts >= 1 && rawAttempts <= 20 ? clampInteger(rawAttempts, 1, 20) : undefined,
    source: params.get('from') === 'loss' ? 'loss' : 'catch',
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
