export function urgencySecondFor(remainingMs: number) {
  if (remainingMs <= 0 || remainingMs > 3000) return 0;
  return Math.ceil(remainingMs / 1000);
}
