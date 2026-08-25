export const MIN_CATCH_HOLD_MS = 140;
export const MIN_CATCH_TRAVEL_PX = 30;

export function isCatchGesture(heldMs: number, traveledPx: number) {
  return heldMs >= MIN_CATCH_HOLD_MS && traveledPx >= MIN_CATCH_TRAVEL_PX;
}

export function distanceFromCatch(distanceToCenter: number, hitRadius: number) {
  return Math.max(0, distanceToCenter - hitRadius);
}

export function canReleaseToCatch(distanceToCenter: number, hitRadius: number, heldMs: number, traveledPx: number) {
  return distanceToCenter <= hitRadius && isCatchGesture(heldMs, traveledPx);
}

export function isWithinReactiveRange(distanceToCenter: number, hitRadius: number, reactionMargin = 74) {
  return distanceToCenter <= hitRadius + reactionMargin;
}

export function missDirection(pointerX: number, pointerY: number, targetX: number, targetY: number) {
  const dx = targetX - pointerX;
  const dy = targetY - pointerY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? '오른쪽' : '왼쪽';
  return dy >= 0 ? '아래' : '위';
}
