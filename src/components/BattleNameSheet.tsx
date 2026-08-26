import { useEffect, useRef, useState } from 'react';
import { BATTLE_NAME_MAX_LENGTH, cleanDuelNickname, duelNicknameError, randomDuelNickname } from '../duel/nickname';

export type BattleNameIntent = 'match' | 'invite' | 'accept' | 'edit';

type Props = {
  initialName: string;
  intent: BattleNameIntent;
  opponentName?: string;
  busy: boolean;
  serverError: string;
  onConfirm: (nickname: string, source: 'typed' | 'random') => void;
  onClose: () => void;
};

const intentCopy: Record<BattleNameIntent, [string, string]> = {
  match: ['배틀에서 뭐라고 불러?', '상대 화면과 승부 결과에 보여요.'],
  invite: ['친구한테 뭐라고 뜰까?', '초대장과 재대결 문구에 이 이름이 들어가요.'],
  accept: ['시비 접수 전, 이름부터.', '상대 화면에 보일 배틀 이름을 정해주세요.'],
  edit: ['배틀 이름 바꾸기', '다음 대전과 주간 리그부터 새 이름을 사용해요.'],
};

export function BattleNameSheet({ initialName, intent, opponentName, busy, serverError, onConfirm, onClose }: Props) {
  const [value, setValue] = useState(initialName);
  const [source, setSource] = useState<'typed' | 'random'>('random');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, detail] = intentCopy[intent];
  const error = touched ? duelNicknameError(value) : '';

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, []);

  function reroll() {
    let next = randomDuelNickname();
    if (next === value) next = randomDuelNickname(`${Date.now()}-again`);
    setValue(next);
    setSource('random');
    setTouched(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (duelNicknameError(value) || busy) return;
    onConfirm(cleanDuelNickname(value), source);
  }

  return <div className="battle-name-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="battle-name-sheet page-enter" role="dialog" aria-modal="true" aria-labelledby="battle-name-title">
      <span className="battle-name-kicker">ONLINE NAME TAG</span>
      <h1 id="battle-name-title">{title}</h1>
      <p>{intent === 'accept' && opponentName ? <><strong>{opponentName}</strong>에게 보여줄 이름이에요.</> : detail}</p>
      <form onSubmit={submit}>
        <label htmlFor="battle-name-input">배틀 이름</label>
        <div className={`battle-name-input ${error || serverError ? 'is-error' : ''}`}>
          <input ref={inputRef} id="battle-name-input" value={value} maxLength={BATTLE_NAME_MAX_LENGTH} autoComplete="off" enterKeyHint="done" onChange={(event) => { setValue(event.target.value); setSource('typed'); setTouched(true); }} aria-describedby="battle-name-help" />
          <span>{cleanDuelNickname(value).length}/{BATTLE_NAME_MAX_LENGTH}</span>
        </div>
        <div id="battle-name-help" className="battle-name-help"><span>{error || serverError || '한글·영문·숫자 2~10자 · 게임용 별명 추천'}</span><button type="button" onClick={reroll} disabled={busy}>🎲 하찮게 다시</button></div>
        <div className="battle-name-preview"><small>이렇게 보임</small><strong>{cleanDuelNickname(value) || '???'} <i>VS</i> 상대 냥손</strong></div>
        <button className="primary-button" type="submit" disabled={busy || Boolean(duelNicknameError(value))}>{busy ? '이름표 붙이는 중…' : intent === 'accept' ? '이 이름으로 시비 접수' : intent === 'edit' ? '이 이름으로 바꾸기' : '이 이름으로 붙기'} <span>→</span></button>
        <button className="text-button" type="button" onClick={onClose} disabled={busy}>{intent === 'edit' ? '그대로 둘래' : '일단 안 붙을래'}</button>
      </form>
    </section>
  </div>;
}
