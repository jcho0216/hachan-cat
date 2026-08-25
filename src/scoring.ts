export function calculateDailyScore(elapsedMs: number, attempts: number, level: number, hitsRequired = 1) {
  const difficultyFactor = 1 + Math.max(0, level - 5) * .04 + Math.max(0, hitsRequired - 1) * .18;
  const normalizedTime = elapsedMs / difficultyFactor;
  const extraAttempts = Math.max(0, attempts - hitsRequired);
  return Math.max(0, Math.round(100_000 - normalizedTime * 4 - extraAttempts * 2_200));
}
