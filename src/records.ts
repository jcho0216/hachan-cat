import type { GameResult } from './types';

export type LevelBest = {
  elapsedMs: number;
  attempts: number;
  accuracy: number;
  grade: string;
};

export type LevelBests = Record<number, LevelBest>;

export const LEVEL_BESTS_KEY = 'hachan-cat-level-bests-v1';

export function readLevelBests(): LevelBests {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEVEL_BESTS_KEY) ?? '{}') as LevelBests;
    return parsed && typeof parsed === 'object' ? parsed : {};
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
