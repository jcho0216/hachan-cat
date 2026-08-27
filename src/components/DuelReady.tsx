import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import type { DuelMatch, DuelSession } from '../duel/types';
import { withNim } from '../duel/nickname';
import { isTimedBossDuel } from '../duel/rules';

type Props = { match: DuelMatch; nickname: string; countdown: number; session?: DuelSession | null };

export function DuelReady({ match, nickname, countdown, session }: Props) {
  const level = getLevel(match.level);
  const timedBoss = isTimedBossDuel(level.hitsRequired);
  const kind = match.sessionId ? `${match.matchSource === 'random' ? '● 실시간' : '✦ 친구'} 5승 선착순 · ${match.sessionRound ?? 1}R` : '● 진짜 사람';
  return <section className="duel-ready-screen page-enter">
    <span className={`duel-kind is-${match.matchSource}`}>{kind}</span>
    <h1>같은 {level.name}.<br /><em>{timedBoss ? '60초, 더 많이 명중한 손이 승.' : '먼저 잡는 손이 승.'}</em></h1>
    <div className="duel-versus">
      <div><small>{session ? `나 · ${session.myScore}승` : '나'}</small><strong>{withNim(nickname)}</strong></div><b>VS</b><div><small>{session ? `상대 · ${session.opponentScore}승` : '접속 중'}</small><strong>{withNim(match.opponentName)}</strong></div>
    </div>
    <div className="duel-ready-cat"><CatCharacter pose="paddle" fur={level.fur} accent={level.accent} evil={level.evil} /></div>
    <strong className="duel-countdown">{countdown > 0 ? countdown : '잡아!'}</strong>
    <p>{timedBoss ? `60초 명중전 · ${level.hitsRequired}번 먼저 잡으면 즉시 1승 · 아니면 명중 수 판정` : match.sessionId ? '한 판 무제한 · 잡으면 1승 · 먼저 5승하면 끝' : '시간·기회 무제한 · 먼저 잡는 즉시 승'}</p>
  </section>;
}
