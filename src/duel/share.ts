import type { DuelOutcome } from './types';

const APP_URL = 'https://hachan-cat.vercel.app/';

function duelCopy(outcome: DuelOutcome) {
  const opponent = outcome.match.opponentName;
  if (outcome.match.isDraw) return `하찮냥 온라인 냥탈전 무승부 😾\n${opponent}랑 둘 다 못 잡아서 고양이만 신남.\n결판 내러 와: ${APP_URL}`;
  if (outcome.match.didWin) {
    const result = outcome.localElapsedMs ? `${opponent}보다 먼저 ${(outcome.localElapsedMs / 1000).toFixed(2)}초 만에 잡음.` : `${opponent}, 나 보자마자 도망감. 기권승.`;
    return `하찮냥 온라인 냥탈전 승리 😼\n${result}\n너도 지금 붙어: ${APP_URL}`;
  }
  return `고양이보다 ${opponent}한테 먼저 털림 😿\n온라인 냥탈전 복수해줘: ${APP_URL}`;
}

export async function shareDuelOutcome(outcome: DuelOutcome) {
  const text = duelCopy(outcome);
  if (navigator.share) {
    await navigator.share({ title: '하찮냥 온라인 냥탈전', text, url: APP_URL });
    return 'native' as const;
  }
  await navigator.clipboard.writeText(text);
  return 'clipboard' as const;
}
