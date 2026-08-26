import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import { getOpponentCatchReaction } from '../duel/taunts';
import type { DuelOutcome, DuelProfile } from '../duel/types';
import { withNim } from '../duel/nickname';

type Props = {
  outcome: DuelOutcome;
  profile: DuelProfile | null;
  nickname: string;
  busy: boolean;
  onRematch: () => void;
  onInvite: () => void;
  onHome: () => void;
};

export function DuelResult({ outcome, profile, nickname, busy, onRematch, onInvite, onHome }: Props) {
  const { match } = outcome;
  const won = match.didWin === true;
  const draw = match.isDraw;
  const local = outcome.localElapsedMs;
  const winning = match.winnerElapsedMs;
  const delta = local !== null && winning !== null ? Math.abs(local - winning) : null;
  const level = getLevel(match.level);
  const myName = withNim(nickname);
  const opponentName = withNim(match.opponentName);
  const opponentReaction = !won && !draw && outcome.reason === 'opponent' ? getOpponentCatchReaction(outcome) : null;
  const headline = draw ? '고양이만 단독승.'
    : won ? `${myName} 승리!`
    : outcome.reason === 'opponent' ? `${opponentName} 승리`
      : outcome.reason === 'connection' ? '연결이 먼저 도망감'
        : '승부 판정이 끊겼음';

  return <section className={`duel-result-screen page-enter ${draw ? 'is-draw' : won ? 'is-win' : 'is-loss'}`}>
    <span className="duel-result-stamp">{draw ? 'CAT WINS' : won ? 'FIRST HAND' : 'TOO LATE'}</span>
    <h1>{draw ? '둘 다 놓침.' : won ? '냥탈 성공.' : '냥탈 실패.'}<br /><em>{headline}</em></h1>
    <p>{match.matchSource === 'invite' ? '친구 5승 선착순' : '실시간 상대'} · {match.opponentName}</p>
    <div className="duel-result-card">
      <CatCharacter caught={won} pose={won ? 'panic' : 'taunt'} fur={level.fur} accent={level.accent} evil={level.evil} />
      <blockquote>{draw ? '“둘이 합쳐도 나 하나를 못 잡네.”' : won ? '“사람끼리 싸우더니 결국 날 잡네.”' : opponentReaction ? <>“{opponentReaction.taunt}”<small>— 상대 손 자동번역</small></> : '“둘 다 나보다 느린 건 똑같아.”'}</blockquote>
      <div><span>내 기록<strong>{local === null ? won ? '기권승' : '못 잡음' : `${(local / 1000).toFixed(2)}초`}</strong></span><span>승부<strong>{draw ? '사이좋게 패배' : won ? local === null ? '상대 이탈' : `${myName} 먼저` : `${opponentName} 먼저`}</strong></span></div>
    </div>
    {profile && <p className="duel-streak-note">{match.matchSource === 'invite' ? `친구전 ${profile.friendWins}승 ${profile.friendLosses}패 · 주간 리그 점수는 그대로.` : draw ? '둘 다 졌으니 연승도 사이좋게 멈춤.' : won ? profile.currentStreak >= 2 ? `🔥 ${profile.currentStreak}연승. 이제 슬슬 이름값 중.` : '첫 연승 불씨를 붙였습니다.' : profile.bestStreak ? `최고 ${profile.bestStreak}연승은 아직 기록에 남아 있음.` : '다음 승부터 연승을 셉니다.'}</p>}
    <div className="duel-result-actions">
      <button className="primary-button" onClick={onRematch} disabled={busy}>새 상대와 바로 붙기 <span>→</span></button>
      <button className="secondary-button" onClick={onInvite} disabled={busy}>{busy ? '초대장 만드는 중…' : match.matchSource === 'invite' ? `${opponentName}에게 재대결` : draw ? '무승부 재대결 열기' : won ? '친구에게 시비 걸기' : '복수전 링크 보내기'}</button>
      <button className="text-button" onClick={onHome} disabled={busy}>홈으로</button>
    </div>
  </section>;
}
