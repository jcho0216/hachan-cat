import type { GameMode } from './types';

export function sanitizeLevelId(value: unknown, fallback = 1, totalLevels = 10) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= totalLevels ? parsed : fallback;
}

export function sanitizeCaughtLevels(value: unknown, totalLevels = 10) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is number =>
    typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= totalLevels,
  ))).sort((a, b) => a - b);
}

export function nextUnlockedLevel(current: number, caughtLevel: number, mode: GameMode, totalLevels = 10) {
  if (mode !== 'campaign') return current;
  return Math.max(current, Math.min(totalLevels, caughtLevel + 1));
}
