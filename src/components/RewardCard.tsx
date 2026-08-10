import { CatCharacter } from './CatCharacter';
import type { GameResult } from '../types';

export function RewardCard({ result, compact = false }: { result: GameResult; compact?: boolean }) {
  return (
    <article className={`reward-card ${compact ? 'is-compact' : ''}`}>
      <div className="reward-card__topline">
        <span>오늘의 포획 기록</span>
        <span className="rarity-pill">{result.reward.rarity}</span>
      </div>
      <div className="reward-card__character">
        <div className="reward-sun" style={{ background: result.reward.color }} />
        <CatCharacter caught reward={result.reward} />
      </div>
      <p className="reward-card__eyebrow">{result.attempts}번 만에 포획</p>
      <h2>{result.reward.name}</h2>
      <p className="reward-card__description">{result.reward.description}</p>
      <div className="score-row">
        <div>
          <strong>{result.grade}</strong>
          <span>손가락 등급</span>
        </div>
        <div>
          <strong>{(result.elapsedMs / 1000).toFixed(1)}초</strong>
          <span>집착한 시간</span>
        </div>
      </div>
      <blockquote>“{result.verdict}”</blockquote>
      <footer>하찮첼 · 너도 잡아봐</footer>
    </article>
  );
}
