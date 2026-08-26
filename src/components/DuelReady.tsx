import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import type { DuelMatch } from '../duel/types';

type Props = { match: DuelMatch; nickname: string; countdown: number };

export function DuelReady({ match, nickname, countdown }: Props) {
  const level = getLevel(match.level);
  return <section className="duel-ready-screen page-enter">
    <span className={`duel-kind is-${match.opponentKind}`}>{match.opponentKind === 'live' ? '● 진짜 사람' : '◌ 최근 고스트'}</span>
    <h1>같은 {level.name}.<br /><em>먼저 잡는 손이 승.</em></h1>
    <div className="duel-versus">
      <div><small>나</small><strong>{nickname}</strong></div><b>VS</b><div><small>{match.opponentKind === 'live' ? '접속 중' : '기록 재생'}</small><strong>{match.opponentName}</strong></div>
    </div>
    <div className="duel-ready-cat"><CatCharacter pose="paddle" fur={level.fur} accent={level.accent} evil={level.evil} /></div>
    <strong className="duel-countdown">{countdown > 0 ? countdown : '잡아!'}</strong>
    <p>15초 · 기회 5번 · 머리에서 먼저 떼기</p>
  </section>;
}
