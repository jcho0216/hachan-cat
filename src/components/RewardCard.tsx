import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import type { GameResult } from '../types';
import { getCatchMoment } from '../resultMoment';

export function RewardCard({ result, compact = false }: { result: GameResult; compact?: boolean }) {
  const level = getLevel(result.level);
  const moment = getCatchMoment(result, level.hitsRequired ?? 1);
  return (
    <article className={`reward-card ${compact ? 'is-compact' : ''}`}>
      <div className="reward-card__topline">
        <span>Lv.{result.level} {result.levelName} 잡기 완료</span>
        <span className="rarity-pill">{result.reward.rarity}</span>
      </div>
      <div className="reward-card__character">
        <div className="reward-sun" style={{ background: level.accent }} />
        <CatCharacter caught reward={result.reward} fur={level.fur} accent={level.accent} evil={level.evil} />
      </div>
      <p className="reward-card__eyebrow"><strong>{moment.label}</strong> · 정확도 {result.accuracy}% · {result.attempts}번 만에 성공</p>
      <h2>{result.reward.name}</h2>
      <p className="reward-card__description">{result.reward.description}</p>
      <div className="score-row">
        <div>
          <strong>{result.grade}</strong>
          <span>플레이 등급</span>
        </div>
        <div>
          <strong>{result.accuracy}%</strong>
          <span>정확도</span>
        </div>
        <div>
          <strong>{(result.elapsedMs / 1000).toFixed(1)}초</strong>
          <span>걸린 시간</span>
        </div>
      </div>
      <blockquote>“{result.verdict}”</blockquote>
      <footer>하찮냥 · 잡았으면 자랑해도 됨</footer>
    </article>
  );
}
