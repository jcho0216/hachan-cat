import { LEVELS } from './levels';

export type DailyBest = { date: string; score: number; elapsedMs: number; attempts: number; level: number };

export const DAILY_BEST_KEY = 'hachan-cat-daily-best-v1';

export function todayInKorea(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function getDailyChallenge(date = todayInKorea()) {
  const seed = hashSeed(`하찮냥:${date}`);
  const level = LEVELS[4 + seed % 6];
  return { date, seed, level, label: `오늘의 한 판 · ${date.slice(5).replace('-', '.')}` };
}

export function calculateDailyScore(elapsedMs: number, attempts: number, nearMisses: number) {
  return Math.max(0, Math.round(30_000 - elapsedMs - Math.max(0, attempts - 1) * 1_200 + nearMisses * 120));
}

export function readDailyBest(): DailyBest | null {
  try { return JSON.parse(localStorage.getItem(DAILY_BEST_KEY) ?? 'null') as DailyBest | null; } catch { return null; }
}
