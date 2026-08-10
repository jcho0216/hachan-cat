import type { CatReward } from './types';

export const TAUNTS = [
  '어딜 누르시나요?',
  '방금 좀 느리셨어요',
  '손가락에 렉 걸림?',
  '설마 그게 최선?',
  '저는 여기 없었는데요',
  '노력은 귀여우시네요',
  '혹시 화면 닦는 중?',
  '고양이한테 피지컬로 지는 중',
  '포기하면 손가락이 편해요',
  '방금은 조금 위험했다냥',
  '여기까지 온 이유가 뭐예요?',
  '자존심을 누르고 계시네요',
  '제가 아니라 화면을 잡으셨는데요',
  '이제 누가 누구를 가지고 놀까요?',
];

export const REWARDS: CatReward[] = [
  {
    id: 'eokul',
    name: '억울냥',
    description: '잡혔지만 아직 결과를 인정하지 않았다.',
    rarity: '흔함',
    color: '#FFE0A8',
    accent: '#FF8D6B',
    face: 'grumpy',
  },
  {
    id: 'kingbad',
    name: '킹받냥',
    description: '잡힌 상태에서도 표정으로 이기고 있다.',
    rarity: '흔함',
    color: '#FFD6E7',
    accent: '#FF6B9A',
    face: 'smug',
  },
  {
    id: 'backpain',
    name: '허리나간냥',
    description: '너무 오래 씰룩거린 대가를 치렀다.',
    rarity: '쓸데없이 희귀',
    color: '#CFF4E5',
    accent: '#36B98A',
    face: 'tired',
  },
  {
    id: 'pretend',
    name: '모른척냥',
    description: '방금 도발한 고양이와 동일묘가 아니라고 주장한다.',
    rarity: '흔함',
    color: '#DDE8FF',
    accent: '#638CEB',
    face: 'blank',
  },
  {
    id: 'clockout',
    name: '퇴근냥',
    description: '잡히자마자 모든 업무 의욕을 상실했다.',
    rarity: '쓸데없이 희귀',
    color: '#E6D9FF',
    accent: '#8B6BD9',
    face: 'sleepy',
  },
  {
    id: 'legend',
    name: '전설의 무표정냥',
    description: '아무 일도 없었다는 얼굴로 역사를 왜곡한다.',
    rarity: '전설인 척함',
    color: '#FFF1A8',
    accent: '#F0B429',
    face: 'proud',
  },
];

export function getGrade(accuracy: number, elapsedMs: number, attempts: number) {
  const seconds = elapsedMs / 1000;
  if (accuracy >= 92 && seconds <= 6 && attempts <= 3) return ['S+', '손가락 암살자'];
  if (accuracy >= 82 && seconds <= 11) return ['A', '인간 중에서는 빠른 편'];
  if (accuracy >= 70 && seconds <= 15) return ['B', '실력으로 자존심을 지켰습니다'];
  if (attempts <= 8) return ['C', '끝내 궤도를 읽었습니다'];
  return ['냥', '근성도 실력으로 쳐드립니다'];
}

export function chooseReward(accuracy: number, attempts: number, elapsedMs: number) {
  if (accuracy >= 95 && elapsedMs <= 7000) return REWARDS[5];
  const pool = accuracy >= 82 || attempts <= 4 ? REWARDS : REWARDS.slice(0, 4);
  return pool[Math.floor(Math.random() * pool.length)];
}
