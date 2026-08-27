export const DUEL_BOSS_ROUND_MS = 60_000;

export function isTimedBossDuel(hitsRequired = 1) {
  return hitsRequired > 1;
}

export function duelBossRemainingMs(elapsedMs: number) {
  return Math.max(0, DUEL_BOSS_ROUND_MS - elapsedMs);
}
