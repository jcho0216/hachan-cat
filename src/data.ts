import type { CatReward } from './types';

export const TAUNTS = [
  '어딜 누르시나요?', '방금 좀 느리셨어요', '손가락에 렉 걸림?', '설마 그게 최선?',
  '저는 여기 없었는데요', '노력은 귀여우시네요', '혹시 화면 닦는 중?',
  '고양이한테 피지컬로 지는 중', '포기하면 손가락이 편해요', '방금은 조금 위험했다냥',
];

export const REWARDS: CatReward[] = [
  { id: 'eokul', name: '억울냥', description: '잡혔지만 아직 결과를 인정하지 않았다.', rarity: '흔함', color: '#FFE0A8', accent: '#FF8D6B', face: 'grumpy' },
  { id: 'kingbad', name: '킹받냥', description: '잡힌 상태에서도 표정으로 이기고 있다.', rarity: '흔함', color: '#FFD6E7', accent: '#FF6B9A', face: 'smug' },
  { id: 'pretend', name: '모른척냥', description: '방금 페이크를 쓴 고양이와 동일묘가 아니라고 주장한다.', rarity: '흔함', color: '#DDE8FF', accent: '#638CEB', face: 'blank' },
  { id: 'backpain', name: '빙글허리냥', description: '원을 너무 열심히 돌아 본인 허리도 놓쳤다.', rarity: '쓸데없이 희귀', color: '#CFF4E5', accent: '#36B98A', face: 'tired' },
  { id: 'afterimage', name: '잔상만남은냥', description: '본묘는 잡혔지만 잔상은 아직 도망치는 중이다.', rarity: '쓸데없이 희귀', color: '#D7D2FF', accent: '#756BE8', face: 'blank' },
  { id: 'crab-license', name: '게면허냥', description: '고양이인데 옆으로만 달릴 수 있는 자격증이 있다.', rarity: '쓸데없이 희귀', color: '#FFD3B8', accent: '#EF754A', face: 'smug' },
  { id: 'buffering', name: '버퍼링냥', description: '순간이동이 아니라 잠깐 끊긴 거라고 주장한다.', rarity: '흔함', color: '#CBE4FF', accent: '#5289DF', face: 'blank' },
  { id: 'chaos-excuse', name: '규칙없냥', description: '규칙이 없으니 패배도 없다는 새 규칙을 만들었다.', rarity: '전설인 척함', color: '#FFE2A8', accent: '#F05F72', face: 'proud' },
  { id: 'butt-shield', name: '엉덩방패냥', description: '최후의 방어 수단과 체면을 동시에 잃었다.', rarity: '쓸데없이 희귀', color: '#D2D1DE', accent: '#77768C', face: 'grumpy' },
  { id: 'overlord-retired', name: '마왕퇴직냥', description: '세계 정복보다 밈 카드 모델이 적성에 맞았다.', rarity: '전설인 척함', color: '#A9A4B8', accent: '#B92235', face: 'proud' },
];

export function getGrade(accuracy: number, elapsedMs: number, attempts: number) {
  const seconds = elapsedMs / 1000;
  if (accuracy >= 92 && seconds <= 6 && attempts <= 3) return ['S+', '손가락 암살자'];
  if (accuracy >= 82 && seconds <= 11) return ['A', '인간 중에서는 빠른 편'];
  if (accuracy >= 70 && seconds <= 15) return ['B', '실력으로 자존심을 지켰습니다'];
  if (attempts <= 8) return ['C', '끝내 궤도를 읽었습니다'];
  return ['냥', '근성도 실력으로 쳐드립니다'];
}

export function chooseReward(level: number) {
  return REWARDS[Math.max(0, Math.min(REWARDS.length - 1, level - 1))];
}
