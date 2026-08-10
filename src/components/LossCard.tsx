import { CatCharacter } from './CatCharacter';
import { getLevel } from '../levels';
import type { GameLoss } from '../types';

export function LossCard({ loss }: { loss: GameLoss }) {
  const level = getLevel(loss.level);
  const isTimeout = loss.reason === 'time';

  return (
    <article className="reward-card loss-card">
      <div className="reward-card__topline">
        <span>Lv.{loss.level} {loss.levelName} 패배 기록</span>
        <span className="rarity-pill loss-pill">CAT WINS</span>
      </div>
      <div className="reward-card__character">
        <div className="reward-sun loss-sun" style={{ background: level.accent }} />
        <CatCharacter pose="taunt" fur={level.fur} accent={level.accent} evil={level.evil} />
      </div>
      <p className="reward-card__eyebrow">{isTimeout ? '15초 동안 화면만 쓰다듬음' : '기회 5회를 야무지게 소진함'}</p>
      <h2>{isTimeout ? '시간한테도 진 인간' : '헛손질 국가대표'}</h2>
      <p className="reward-card__description">{isTimeout ? '고양이는 끝까지 쉬지 않았고, 손가락만 지쳤다.' : '다섯 번의 기회를 고양이 털끝에 기부했다.'}</p>
      <div className="score-row">
        <div><strong>패</strong><span>오늘의 전적</span></div>
        <div><strong>{loss.attempts}회</strong><span>덮치기</span></div>
        <div><strong>{(loss.elapsedMs / 1000).toFixed(1)}초</strong><span>버틴 시간</span></div>
      </div>
      <blockquote>“{isTimeout ? '기다리면 쉬워질 줄 알았어?' : '다음 손가락 데려와.'}”</blockquote>
      <footer>하찮냥 · 너도 털려봐</footer>
    </article>
  );
}
