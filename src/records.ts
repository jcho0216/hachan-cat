import type { GameResult } from './types';

export type LevelBest = {
  elapsedMs: number;
  attempts: number;
  accuracy: number;
  grade: string;
};

export type LevelBests = Record<number, LevelBest>;

export const LEVEL_BESTS_KEY = 'hachan-cat-level-bests-v1';

export function sanitizeLevelBests(value: unknown): LevelBests {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const level = Number(key);
    if (!Number.isInteger(level) || level < 1 || level > 10 || !entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.elapsedMs !== 'number' || !Number.isFinite(item.elapsedMs) || item.elapsedMs < 0 || item.elapsedMs > 15_000
      || typeof item.attempts !== 'number' || !Number.isInteger(item.attempts) || item.attempts < 1
      || typeof item.accuracy !== 'number' || !Number.isFinite(item.accuracy) || item.accuracy < 0 || item.accuracy > 100
      || typeof item.grade !== 'string' || item.grade.length > 8) return [];
    return [[level, { elapsedMs: item.elapsedMs, attempts: item.attempts, accuracy: item.accuracy, grade: item.grade }]];
  }));
}

export function readLevelBests(): LevelBests {
  try {
    return sanitizeLevelBests(JSON.parse(localStorage.getItem(LEVEL_BESTS_KEY) ?? '{}'));
  } catch { return {}; }
}

export function isBetterResult(result: Pick<GameResult, 'elapsedMs' | 'attempts' | 'accuracy'>, current?: LevelBest) {
  if (!current) return true;
  if (result.elapsedMs !== current.elapsedMs) return result.elapsedMs < current.elapsedMs;
  if (result.attempts !== current.attempts) return result.attempts < current.attempts;
  return result.accuracy > current.accuracy;
}

export function recordLevelBest(bests: LevelBests, result: GameResult) {
  if (!isBetterResult(result, bests[result.level])) return { bests, isNewBest: false };
  return {
    bests: {
      ...bests,
      [result.level]: {
        elapsedMs: result.elapsedMs,
        attempts: result.attempts,
        accuracy: result.accuracy,
        grade: result.grade,
      },
    },
    isNewBest: true,
  };
}
