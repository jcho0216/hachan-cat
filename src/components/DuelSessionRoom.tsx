import { useEffect, useState } from 'react';
import { getLevel, LEVELS } from '../levels';
import { withNim } from '../duel/nickname';
import { DUEL_WAITING_TAUNTS, duelWaitingTaunt } from '../duel/taunts';
import type { DuelOutcome, DuelSession } from '../duel/types';
import { CatCharacter } from './CatCharacter';

type Props = {
  session: DuelSession;
  outcome: DuelOutcome | null;
  nickname: string;
  busy: boolean;
  onChoose: (level: number) => void;
  onTaunt: (tauntId: number) => void;
  onLeave: () => void;
};

export function DuelSessionRoom({ session, outcome, nickname, busy, onChoose, onTaunt, onLeave }: Props) {
  const targetScore = 5;
  const [remaining, setRemaining] = useState(0);
  const previous = getLevel(session.selectedLevel);
  const myName = withNim(nickname);
  const opponentName = withNim(session.opponentName);
  const draw = outcome?.match.isDraw === true;
  const won = outcome?.match.didWin === true;
  const hitDecision = outcome?.match.resultKind === 'hits';
  const seriesFinished = session.status === 'closed' && !session.leftByMe && !session.opponentLeft
    && Math.max(session.myScore, session.opponentScore) >= targetScore;
  const seriesWon = seriesFinished && session.myScore >= targetScore;
  const isRealtime = session.source === 'random';
  const waitingTaunt = duelWaitingTaunt(session.lastTauntId);
  const seriesLabel = isRealtime ? '실시간 냥탈전' : '친구 냥탈전';

  useEffect(() => {
    if (!session.choiceDeadline) { setRemaining(0); return; }
    const update = () => setRemaining(Math.max(0, Math.ceil((session.choiceDeadline! - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [session.choiceDeadline]);

  const headline = session.status === 'closed'
    ? seriesFinished
      ? seriesWon ? `${myName}, 5승 먼저.` : `${opponentName}, 5승 먼저.`
      : session.opponentLeft ? `${opponentName}이 먼저 튐.` : '오늘 시비는 여기까지.'
    : session.chooserIsMe
      ? draw ? '명중 동점. 네가 골라.' : `${myName}, 졌으니 골라.`
      : `${opponentName}이 복수 준비 중.`;
  const detail = session.status === 'closed'
    ? seriesFinished
      ? seriesWon ? `${opponentName}을 이긴 승리카드가 나왔습니다.` : `${opponentName}이 먼저 다섯 판을 가져갔습니다.`
      : '점수는 남았고, 앙금도 적당히 남았습니다.'
    : session.chooserIsMe
      ? `선택이 늦으면 ${previous.name}이 한 번 더 나옵니다.`
      : `${withNim(session.chooserName || session.opponentName)}이 다음 고양이를 고르는 중…`;

  return <section className={`duel-session-room page-enter ${session.chooserIsMe ? 'is-chooser' : ''}`}>
    <span className="duel-invite-ticket">FIRST TO 5 · {isRealtime ? 'LIVE MATCH' : 'FRIEND BATTLE'}</span>
    <div className="duel-session-score" aria-label="5승 선착순 세션 점수">
      <div><small>{myName}</small><strong>{session.myScore}</strong></div><b>:</b><div><small>{opponentName}</small><strong>{session.opponentScore}</strong></div>
    </div>
    <span className="duel-session-round">ROUND {Math.max(1, session.round - (session.status === 'choosing' || session.status === 'closed' ? 1 : 0))}</span>
    <h1>{headline}</h1>
    <p>{detail}</p>

    {seriesWon && <article className="duel-result-card">
      <CatCharacter caught pose="panic" fur={previous.fur} accent={previous.accent} evil={previous.evil} />
      <blockquote>“{myName}, {opponentName}을 이김.”<small>5승 선착순 · {seriesLabel}</small></blockquote>
      <div><span>최종 승자<strong>{myName}</strong></span><span>최종 점수<strong>{session.myScore} : {session.opponentScore}</strong></span></div>
    </article>}

    {seriesFinished && !seriesWon && <div className="duel-session-last is-loss">
      <CatCharacter pose="taunt" fur={previous.fur} accent={previous.accent} evil={previous.evil} />
      <div><small>5승 선착순 종료</small><strong>{opponentName} 승리</strong><span>최종 점수 {session.myScore} : {session.opponentScore}</span></div>
    </div>}

    {outcome && session.status !== 'closed' && <div className={`duel-session-last ${draw ? 'is-draw' : won ? 'is-win' : 'is-loss'}`}>
      <CatCharacter caught={won} pose={won ? 'panic' : 'taunt'} fur={previous.fur} accent={previous.accent} evil={previous.evil} />
      <div><small>방금 판 · {previous.name}</small><strong>{draw ? '명중 동점 · 점수 그대로' : hitDecision ? won ? `${myName} 판정승` : `${opponentName} 판정승` : won ? `${myName} 먼저` : `${opponentName} 먼저`}</strong><span>{hitDecision || draw ? `60초 명중 · 나 ${outcome.match.myHits} : ${outcome.match.opponentHits} 상대` : outcome.localElapsedMs === null ? '나는 못 잡음' : `내 기록 ${(outcome.localElapsedMs / 1000).toFixed(2)}초`}</span></div>
    </div>}

    {session.status === 'choosing' && session.chooserIsMe && waitingTaunt && !session.lastTauntIsMine && <aside className="duel-session-taunt-received" role="status" aria-live="polite">
      <small>{opponentName}의 도발</small><strong>“{waitingTaunt}”</strong>
    </aside>}

    {session.status === 'choosing' && session.chooserIsMe && <>
      <div className="duel-session-picker-head"><strong>복수할 냥이 선택</strong><span>{remaining || 0}</span></div>
      <div className="duel-session-cat-grid" aria-label="다음 라운드 고양이 선택">
        {LEVELS.map((level) => <button key={level.id} className={level.id === session.selectedLevel ? 'is-current' : ''} disabled={busy} onClick={() => onChoose(level.id)}>
          <CatCharacter pose={level.poses[0]} fur={level.fur} accent={level.accent} evil={level.evil} />
          <span>Lv.{level.id}</span><strong>{level.name}</strong>
        </button>)}
      </div>
    </>}

    {session.status === 'choosing' && !session.chooserIsMe && <>
      <div className="duel-session-wait">
        <CatCharacter pose="paddle" fur={previous.fur} accent={previous.accent} evil={previous.evil} />
        <span>{remaining ? `${remaining}` : '곧'}</span><strong>상대의 선택을 기다리는 중</strong><small>안 고르면 {previous.name} 재등장</small>
      </div>
      {session.lastWinnerIsMe && <div className="duel-session-taunt-picker">
        <div><small>WINNER ONLY</small><strong>기다리는 동안 한마디</strong></div>
        <div>{DUEL_WAITING_TAUNTS.map((taunt, tauntId) => <button key={taunt} disabled={busy} aria-pressed={session.lastTauntIsMine && session.lastTauntId === tauntId} onClick={() => onTaunt(tauntId)}>“{taunt}”</button>)}</div>
      </div>}
    </>}

    {session.status === 'playing' && <div className="duel-session-wait"><CatCharacter pose="peek" fur={previous.fur} accent={previous.accent} evil={previous.evil} /><span>!</span><strong>다음 판 만드는 중</strong></div>}

    {session.status === 'closed' ? <button className="primary-button" onClick={onLeave}>{seriesWon ? '승리카드 챙기고 홈으로' : '결과 확인하고 홈으로'} <span>→</span></button>
      : <button className="text-button duel-session-leave" onClick={onLeave} disabled={busy}>여기까지만 하고 나가기</button>}
  </section>;
}
