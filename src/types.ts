export type CatReward = {
  id: string;
  name: string;
  description: string;
  rarity: '흔한 척' | '제법 희귀' | '전설이라고 함';
  color: string;
  accent: string;
  face: 'smug' | 'tired' | 'blank' | 'grumpy' | 'proud' | 'sleepy';
};

export type GameMode = 'campaign' | 'daily' | 'challenge';

export type GameResult = {
  attempts: number;
  elapsedMs: number;
  accuracy: number;
  nearMisses: number;
  misses?: number;
  level: number;
  levelName: string;
  grade: string;
  verdict: string;
  reward: CatReward;
  mode?: GameMode;
  score?: number;
};

export type GameLoss = {
  level: number;
  levelName: string;
  reason: 'time' | 'misses';
  elapsedMs: number;
  attempts: number;
  nearMisses: number;
  closestDistance: number;
  mode?: GameMode;
};
