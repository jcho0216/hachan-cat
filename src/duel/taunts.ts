import type { DuelOutcome } from './types';

const CLOSE_TAUNTS = [
  '거의 잡았네. 거의.',
  '손끝 차이도 패배는 패배래.',
  '방금 건 다시 하면 이길지도?',
];

const FAST_TAUNTS = [
  '너 잡을 때 난 이미 결과 봄.',
  '고양이보다 네 손이 더 잘 도망가네.',
  '잠깐, 아직 시작 안 한 거 아니지?',
];

const ONE_SHOT_TAUNTS = [
  '한 번에 잡았는데, 넌 뭐 함?',
  '첫 손에 끝. 설명 더 필요함?',
  '연습인 줄 알았는데 끝났네.',
];

const REGULAR_TAUNTS = [
  '그것밖에 안 되냐?',
  '방금 잡으려던 거 맞지?',
  '천천히 해. 어차피 또 질 거니까.',
  '손가락 업데이트가 필요해 보임.',
  '고양이는 같았는데 결과는 왜 다르지?',
];

export const DUEL_WAITING_TAUNTS = [
  '그것밖에 안 되냐?',
  '거의 잡았네. 거의.',
  '한 번에 잡았는데, 넌 뭐 함?',
  '손가락 업데이트가 필요해 보임.',
  '고양이는 같았는데 결과는 왜 다르지?',
  '천천히 해. 어차피 또 질 거니까.',
] as const;

export function duelWaitingTaunt(tauntId: number | null) {
  return tauntId !== null && Number.isInteger(tauntId) ? DUEL_WAITING_TAUNTS[tauntId] ?? null : null;
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

function pick(values: readonly string[], seed: string) {
  return values[hash(seed) % values.length];
}

export function getOpponentCatchReaction(outcome: DuelOutcome) {
  const { match } = outcome;
  const elapsedMs = match.winnerElapsedMs;
  const attempts = match.winnerAttempts;
  const isClose = outcome.localElapsedMs !== null && elapsedMs !== null && Math.abs(outcome.localElapsedMs - elapsedMs) <= 450;
  const pool = isClose ? CLOSE_TAUNTS : attempts === 1 ? ONE_SHOT_TAUNTS : elapsedMs !== null && elapsedMs <= 3_800 ? FAST_TAUNTS : REGULAR_TAUNTS;
  const taunt = pick(pool, `${match.id}:${elapsedMs}:${attempts}`);
  const timing = elapsedMs === null ? '상대가 먼저 잡음' : `${(elapsedMs / 1000).toFixed(2)}초 만에 잡음`;
  const attemptLabel = attempts ? ` · ${attempts}번 시도` : '';
  return {
    kicker: '상대 손이 먼저 낚아챔',
    title: `${match.opponentName.endsWith('님') ? match.opponentName : `${match.opponentName}님`} 선착순`,
    detail: `${timing}${attemptLabel}`,
    taunt,
  };
}
