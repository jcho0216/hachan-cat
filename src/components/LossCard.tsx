import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import type { GameLoss } from '../types';
import { getLossCopy } from '../lossCopy';

export function LossCard({ loss }: { loss: GameLoss }) {
  const level = getLevel(loss.level);
  const copy = getLossCopy(loss);

  return (
    <article className="reward-card loss-card">
      <div className="reward-card__topline">
        <span>Lv.{loss.level} {loss.levelName}에게 놓침</span>
        <span className="rarity-pill loss-pill">CAT WINS</span>
      </div>
      <div className="reward-card__character">
        <div className="reward-sun loss-sun" style={{ background: level.accent }} />
        <CatCharacter pose="taunt" fur={level.fur} accent={level.accent} evil={level.evil} />
      </div>
      <p className="reward-card__eyebrow">{copy.eyebrow}</p>
      <h2>{copy.title}</h2>
      <p className="reward-card__description">{copy.description}</p>
      <div className="score-row">
        <div><strong>패</strong><span>이번 결과</span></div>
        <div><strong>{loss.attempts}회</strong><span>시도</span></div>
        <div><strong>{(loss.elapsedMs / 1000).toFixed(1)}초</strong><span>플레이 시간</span></div>
      </div>
      <blockquote>“{copy.quote}”</blockquote>
      <footer>하찮냥 · 놓친 것도 기록은 기록</footer>
    </article>
  );
}
