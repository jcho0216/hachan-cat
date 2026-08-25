export type DailyHistoryEntry = { date: string; score: number; elapsedMs: number; attempts: number; level: number };

export const DAILY_HISTORY_KEY = 'hachan-cat-daily-history-v1';

const asUtcDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const formatUtcDate = (value: Date) => value.toISOString().slice(0, 10);
const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = asUtcDate(value);
  return Number.isFinite(parsed.getTime()) && formatUtcDate(parsed) === value;
};
const shiftDate = (value: string, days: number) => {
  const date = asUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
};

export function sanitizeDailyBest(value: unknown): DailyHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const [entry] = sanitizeDailyHistory([value]);
  return entry ?? null;
}

export function sanitizeDailyHistory(value: unknown): DailyHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is DailyHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Record<string, unknown>;
    return isDate(item.date)
      && typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100_000
      && typeof item.elapsedMs === 'number' && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 && item.elapsedMs <= 15_000
      && typeof item.attempts === 'number' && Number.isInteger(item.attempts) && item.attempts >= 1 && item.attempts <= 20
      && typeof item.level === 'number' && Number.isInteger(item.level) && item.level >= 1 && item.level <= 10;
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
}

export function readDailyHistory(): DailyHistoryEntry[] {
  try { return sanitizeDailyHistory(JSON.parse(localStorage.getItem(DAILY_HISTORY_KEY) ?? '[]')); }
  catch { return []; }
}

export function recordDailyScore(history: DailyHistoryEntry[], entry: DailyHistoryEntry) {
  const byDate = new Map(sanitizeDailyHistory(history).map((item) => [item.date, item]));
  const current = byDate.get(entry.date);
  if (!current || entry.score > current.score) byDate.set(entry.date, entry);
  return sanitizeDailyHistory([...byDate.values()]);
}

export function weekStart(date: string) {
  const current = asUtcDate(date);
  const daysSinceMonday = (current.getUTCDay() + 6) % 7;
  return shiftDate(date, -daysSinceMonday);
}

export function getWeeklyBest(history: DailyHistoryEntry[], today: string) {
  const start = weekStart(today);
  return sanitizeDailyHistory(history).filter((entry) => entry.date >= start && entry.date <= today).reduce<DailyHistoryEntry | null>((best, entry) => !best || entry.score > best.score ? entry : best, null);
}

export function getDailyStreak(history: DailyHistoryEntry[], today: string) {
  const dates = new Set(sanitizeDailyHistory(history).map((entry) => entry.date));
  let cursor = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(cursor) && streak < 60) { streak += 1; cursor = shiftDate(cursor, -1); }
  return streak;
}
