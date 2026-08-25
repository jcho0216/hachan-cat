import type { GameResult } from './types';

export type CatchMoment = { label: string; description: string };

export function averageHitAccuracy(accumulatedAccuracy: number, finalAccuracy: number, requiredHits: number) {
  return Math.round((accumulatedAccuracy + finalAccuracy) / Math.max(1, requiredHits));
}

export function getCatchMoment(result: Pick<GameResult, 'elapsedMs' | 'attempts' | 'accuracy' | 'nearMisses' | 'misses'>, requiredHits = 1): CatchMoment {
  const misses = result.misses ?? Math.max(0, result.attempts - requiredHits);
  if (result.elapsedMs >= 14_000) return { label: '0초대 역전', description: '끝나기 직전에 낚아챘다.' };
  if (requiredHits > 1 && misses === 0) return { label: '왕관 퍼펙트', description: `${requiredHits}번 연속으로 머리를 맞혔다.` };
  if (misses === 0 && result.accuracy >= 95) return { label: '정중앙 원샷', description: '첫 시도에 머리 정중앙을 잡았다.' };
  if (misses === 0) return { label: '노미스 포획', description: '기회 하나도 쓰지 않고 끝냈다.' };
  if (result.nearMisses >= 3) return { label: '수염 끝 추격', description: '수염만 스치다가 결국 잡았다.' };
  if (result.accuracy >= 95) return { label: '정중앙 포획', description: '마지막 손끝은 정확했다.' };
  return { label: '집요한 추적', description: '놓쳐도 끝까지 따라가 잡았다.' };
}
