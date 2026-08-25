import type { GameMode } from './types';

export function nextUnlockedLevel(current: number, caughtLevel: number, mode: GameMode, totalLevels = 10) {
  if (mode !== 'campaign') return current;
  return Math.max(current, Math.min(totalLevels, caughtLevel + 1));
}
