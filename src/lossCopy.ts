import type { GameLoss } from './types';

export type LossCopy = { eyebrow: string; title: string; description: string; quote: string };

const picks = <T,>(items: T[], seed: number) => items[Math.abs(seed) % items.length];

export function getLossCopy(loss: GameLoss): LossCopy {
  const seed = loss.level * 31 + loss.attempts * 7 + loss.nearMisses * 13 + Math.round(loss.elapsedMs / 250);
  if (loss.closestDistance <= 8) return {
    eyebrow: '수염 한 올 차이로 인간 패배', title: '거의 잡을 뻔한 사람',
    description: `${loss.nearMisses}번이나 아슬아슬했지만 고양이 자존감만 올려줬다.`, quote: '거의는 도감에 안 들어가.',
  };
  if (loss.nearMisses >= 3) return {
    eyebrow: '털끝만 야무지게 수집함', title: '수염 전문 추적자',
    description: `아슬아슬한 실패 ${loss.nearMisses}회. 화면은 두드렸고 고양이는 웃었다.`, quote: '털 한 가닥은 인정해 줄게.',
  };
  if (loss.level >= 9) return {
    eyebrow: '왕관은커녕 체면만 내려놓음', title: picks(['마왕 간식 배달부', '보스 체력 마사지사', '왕좌 앞 화면닦이'], seed),
    description: '어려운 냥이에게 귀중한 다섯 번의 기회를 전부 헌납했다.', quote: '도전은 고마운데 위협은 아니었어.',
  };
  if (loss.reason === 'time') return {
    eyebrow: '15초 동안 화면만 쓰다듬음', title: picks(['시간한테도 진 인간', '관찰만 하다 퇴근', '고양이 영상 15초 감상'], seed),
    description: picks(['고양이는 끝까지 쉬지 않았고 손가락만 지쳤다.', '기다리면 쉬워질 거라는 믿음이 먼저 끝났다.', '오늘도 인간의 패배로 화면은 평화롭다.'], seed + 1),
    quote: picks(['기다리면 쉬워질 줄 알았어?', '구경료는 다음 판으로 받을게.', '시간도 내 편이거든.'], seed + 2),
  };
  return {
    eyebrow: '기회 5회를 야무지게 소진함', title: picks(['헛손질 국가대표', '손가락 길 잃음', '고양이 자존감 후원자'], seed),
    description: picks(['다섯 번의 기회를 고양이 털끝에 기부했다.', '손은 빨랐는데 냥이가 더 얄미웠다.', '정확히 다섯 번, 고양이 없는 곳만 골랐다.'], seed + 1),
    quote: picks(['다음 손가락 데려와.', '화면 닦기는 합격.', '또 해. 재밌으니까.'], seed + 2),
  };
}
