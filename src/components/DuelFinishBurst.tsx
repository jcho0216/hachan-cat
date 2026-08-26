import { useEffect, useRef } from 'react';
import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import { getOpponentCatchReaction } from '../duel/taunts';
import type { DuelOutcome } from '../duel/types';

type Props = { outcome: DuelOutcome; onDone: () => void };

export function DuelFinishBurst({ outcome, onDone }: Props) {
  const reaction = getOpponentCatchReaction(outcome);
  const level = getLevel(outcome.match.level);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), 2_200);
    return () => window.clearTimeout(timer);
  }, [outcome.match.id]);

  return <button className="duel-finish-burst page-enter" onClick={onDone} aria-label="상대 선착순 결과 보기">
    <span className="duel-burst-speed">상대 선착순</span>
    <p>{reaction.kicker}</p>
    <h1>{reaction.title}</h1>
    <div className="duel-burst-cat"><CatCharacter pose="taunt" fur={level.fur} accent={level.accent} evil={level.evil} /></div>
    <blockquote><small>상대 손 번역기</small>“{reaction.taunt}”</blockquote>
    <strong>{reaction.detail}</strong>
    <em>눌러서 결과 보기</em>
  </button>;
}
