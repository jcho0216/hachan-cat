import type { GameMode } from './types';

export const DEFAULT_START_LEVEL = 3;

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

export function mapLegacyLevel(value: unknown, totalLevels = 10) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(totalLevels, Math.ceil(parsed / 2))) : 1;
}

export function resolveInitialSelectedLevel(saved: unknown, legacySaved: unknown, totalLevels = 10) {
  const legacyFallback = legacySaved === null || legacySaved === undefined
    ? DEFAULT_START_LEVEL
    : mapLegacyLevel(legacySaved, totalLevels);
  return sanitizeLevelId(saved, legacyFallback, totalLevels);
}

export function nextUnlockedLevel(current: number, caughtLevel: number, mode: GameMode, totalLevels = 10) {
  if (mode !== 'campaign') return current;
  return Math.max(current, Math.min(totalLevels, caughtLevel + 1));
}
