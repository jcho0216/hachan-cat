import type { CatReward } from './types';

export const TAUNTS = [
  '거긴 비었는데.', '조금 늦었어.', '손 다 보이는데?', '한 번 더 해봐.',
  '난 여기 없었어.', '열심히는 하네.', '화면 닦는 중?',
  '고양이한테 지는 중.', '쉬었다 해도 돼.', '방금은 좀 위험했어.',
];

export const REWARDS: CatReward[] = [
  { id: 'eokul', name: '억울냥', description: '잡히고도 판정에 이의를 제기하는 중.', rarity: '흔한 척', color: '#FFE0A8', accent: '#FF8D6B', face: 'grumpy' },
  { id: 'kingbad', name: '킹받냥', description: '졌는데 표정은 이긴 쪽이다.', rarity: '흔한 척', color: '#FFD6E7', accent: '#FF6B9A', face: 'smug' },
  { id: 'pretend', name: '모른척냥', description: '방금 도망간 고양이를 전혀 모른다고 한다.', rarity: '흔한 척', color: '#DDE8FF', accent: '#638CEB', face: 'blank' },
  { id: 'backpain', name: '어질냥', description: '본인도 어디로 돌고 있었는지 놓쳤다.', rarity: '제법 희귀', color: '#CFF4E5', accent: '#36B98A', face: 'tired' },
  { id: 'afterimage', name: '본체잡힘냥', description: '본체는 잡혔고 잔상만 계속 도망가는 중.', rarity: '제법 희귀', color: '#D7D2FF', accent: '#756BE8', face: 'blank' },
  { id: 'crab-license', name: '게면허냥', description: '옆걸음만으로 면허까지 땄다.', rarity: '제법 희귀', color: '#FFD3B8', accent: '#EF754A', face: 'smug' },
  { id: 'buffering', name: '버퍼링냥', description: '순간이동이 아니라 잠깐 끊긴 거라고 한다.', rarity: '흔한 척', color: '#CBE4FF', accent: '#5289DF', face: 'blank' },
  { id: 'chaos-excuse', name: '규칙없냥', description: '규칙이 없으니 진 적도 없다고 우긴다.', rarity: '전설이라고 함', color: '#FFE2A8', accent: '#F05F72', face: 'proud' },
  { id: 'butt-shield', name: '엉덩방패냥', description: '마지막 방어와 체면을 함께 잃었다.', rarity: '제법 희귀', color: '#D2D1DE', accent: '#77768C', face: 'grumpy' },
  { id: 'overlord-retired', name: '마왕퇴직냥', description: '왕관을 잃고 밈 카드 모델이 됐다.', rarity: '전설이라고 함', color: '#A9A4B8', accent: '#B92235', face: 'proud' },
];

export function getGrade(accuracy: number, elapsedMs: number, attempts: number) {
  const seconds = elapsedMs / 1000;
  if (accuracy >= 92 && seconds <= 6 && attempts <= 3) return ['S+', '이건 고양이도 인정'];
  if (accuracy >= 82 && seconds <= 11) return ['A', '제법 빨랐어'];
  if (accuracy >= 70 && seconds <= 15) return ['B', '두 번은 안 놓치겠네'];
  if (attempts <= 8) return ['C', '끝까지 따라왔네'];
  return ['냥', '잡았으면 됐지'];
}

export function chooseReward(level: number) {
  return REWARDS[Math.max(0, Math.min(REWARDS.length - 1, level - 1))];
}
