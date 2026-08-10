export type CatReward = {
  id: string;
  name: string;
  description: string;
  rarity: '흔함' | '쓸데없이 희귀' | '전설인 척함';
  color: string;
  accent: string;
  face: 'smug' | 'tired' | 'blank' | 'grumpy' | 'proud' | 'sleepy';
};

export type GameResult = {
  attempts: number;
  elapsedMs: number;
  grade: string;
  verdict: string;
  reward: CatReward;
};
