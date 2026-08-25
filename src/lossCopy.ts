import type { GameLoss } from './types';

export type LossCopy = { eyebrow: string; title: string; description: string; quote: string };

const picks = <T,>(items: T[], seed: number) => items[Math.abs(seed) % items.length];

export function getClosenessLabel(distance: number) {
  if (!Number.isFinite(distance)) return '—';
  if (distance <= 8) return '털끝';
  if (distance <= 25) return '코앞';
  if (distance <= 60) return '근처';
  return '멀리';
}

export function getLossCopy(loss: GameLoss): LossCopy {
  const seed = loss.level * 31 + loss.attempts * 7 + loss.nearMisses * 13 + Math.round(loss.elapsedMs / 250);
  if (loss.closestDistance <= 8) return {
    eyebrow: '정말 딱 한 끗 차이', title: '거의 잡았냥',
    description: '수염은 스쳤는데 고양이는 안 잡혔다.', quote: '거의는 거의고.',
  };
  if (loss.nearMisses >= 3) return {
    eyebrow: `수염만 ${loss.nearMisses}번 스침`, title: '털끝 전문가',
    description: '가까이 가는 데는 성공. 잡는 건 다음 문제.', quote: '수염은 잡은 걸로 해줄게.',
  };
  if (loss.level >= 9) return {
    eyebrow: '왕관 근처도 못 감', title: picks(['마왕 운동 도우미', '보스 체력 관리사', '왕좌 앞 구경꾼'], seed),
    description: '고양이는 멀쩡하고 사람만 바빴다.', quote: '도전은 고마웠어.',
  };
  if (loss.reason === 'time') return {
    eyebrow: '15초 종료', title: picks(['구경 잘했어?', '고양이만 운동함', '시간 다 썼네'], seed),
    description: picks(['고양이는 뛰었고 사람은 타이밍을 놓쳤다.', '기다렸지만 쉬워지는 일은 없었다.', '잡을 생각만 하다가 판이 끝났다.'], seed + 1),
    quote: picks(['다 봤으면 한 번 더 해.', '다음엔 조금 빨리 와.', '시간도 내 편이야.'], seed + 2),
  };
  return {
    eyebrow: '기회 5번 종료', title: picks(['손이 비었네', '고양이 없는 곳만', '다섯 번 다 봤어'], seed),
    description: picks(['빠르긴 했는데 방향이 달랐다.', '고양이는 그대로고 기회만 사라졌다.', '화면은 다섯 번 정확히 눌렀다. 고양이만 빼고.'], seed + 1),
    quote: picks(['다음 판도 볼게.', '한 번 더 해봐.', '이번엔 어디 누를지 궁금하네.'], seed + 2),
  };
}
