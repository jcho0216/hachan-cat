import type { GameMode } from './types';

export type ResultPrimaryAction = 'next' | 'retry' | 'share';

export function getResultPrimaryAction(mode: GameMode | undefined, level: number, totalLevels: number, challengeOutcome: 'won' | 'tied' | 'lost' | null): ResultPrimaryAction {
  const currentMode = mode ?? 'campaign';
  if (currentMode === 'campaign' && level < totalLevels) return 'next';
  if (currentMode === 'daily') return 'retry';
  if (currentMode === 'challenge' && (challengeOutcome === 'lost' || challengeOutcome === 'tied')) return 'retry';
  return 'share';
}
