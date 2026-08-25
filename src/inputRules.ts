export const MIN_CATCH_HOLD_MS = 140;
export const MIN_CATCH_TRAVEL_PX = 30;

export function isCatchGesture(heldMs: number, traveledPx: number) {
  return heldMs >= MIN_CATCH_HOLD_MS && traveledPx >= MIN_CATCH_TRAVEL_PX;
}
