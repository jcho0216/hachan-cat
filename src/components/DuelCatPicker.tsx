import { LEVELS } from '../levels';
import { CatCharacter } from './CatCharacter';

type Props = {
  title?: string;
  detail?: string;
  busy: boolean;
  selectedLevel?: number;
  onChoose: (level: number) => void;
  onClose?: () => void;
};

export function DuelCatPicker({ title = '첫 판 냥이 골라.', detail = '이 고양이 이름까지 초대장에 박힙니다.', busy, selectedLevel, onChoose, onClose }: Props) {
  return <section className="duel-cat-picker page-enter">
    <span className="duel-invite-ticket">CHOOSE YOUR CAT</span>
    <h1>{title}</h1>
    <p>{detail}</p>
    <div className="duel-cat-grid" aria-label="대결할 고양이 선택">
      {LEVELS.map((level) => <button key={level.id} className={selectedLevel === level.id ? 'is-current' : ''} disabled={busy} onClick={() => onChoose(level.id)}>
        <span>Lv.{level.id}</span>
        <CatCharacter pose={level.poses[0]} fur={level.fur} accent={level.accent} evil={level.evil} />
        <strong>{level.name}</strong>
        <small>{(level.hitsRequired ?? 1) > 1 ? '60초 명중전' : level.chapter}</small>
      </button>)}
    </div>
    {busy && <div className="duel-picker-busy"><i /><i /><i /><span>고양이 데려오는 중…</span></div>}
    {onClose && <button className="text-button" onClick={onClose} disabled={busy}>일단 안 붙을래</button>}
  </section>;
}
