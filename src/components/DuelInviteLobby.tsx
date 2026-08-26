import { CatCharacter } from './CatCharacter';
import type { DuelInvite } from '../duel/types';
import { withNim } from '../duel/nickname';

type Props = {
  invite: DuelInvite | null;
  phase: 'creating' | 'waiting' | 'expired' | 'error';
  remainingSeconds: number;
  nickname: string;
  busy: boolean;
  onShare: () => void;
  onRandom: () => void;
  onCancel: () => void;
  onCreate: () => void;
};

export function DuelInviteLobby({ invite, phase, remainingSeconds, nickname, busy, onShare, onRandom, onCancel, onCreate }: Props) {
  const waiting = phase === 'waiting';
  const hostName = invite?.hostName ?? nickname;
  const title = phase === 'creating' ? '초대장 구기는 중'
    : waiting ? `${withNim(hostName)}, 기다리는 중`
      : phase === 'expired' ? '친구가 고양이보다 느림' : '초대장이 잠깐 삐끗함';
  const detail = phase === 'creating' ? '한 명만 들어올 수 있는 방을 만들고 있어요.'
    : waiting ? '링크에서 도전을 받는 순간, 둘 다 5초 뒤 시작.'
      : phase === 'expired' ? '이 방은 닫혔어요. 전적에는 아무 일도 없던 걸로.' : '랜덤 대전과 혼자 놀기는 그대로 가능합니다.';
  return <section className="duel-invite-lobby page-enter">
    <span className="duel-invite-ticket">친구 지목전 · 1회용</span>
    <h1>{title}</h1>
    <p>{detail}</p>
    <div className="duel-invite-wait-cat"><CatCharacter pose={waiting ? 'paddle' : phase === 'creating' ? 'peek' : 'butt'} evil={waiting ? 5 : 2} /><span>{waiting ? '언제 옴?' : '...'}</span></div>
    <div className="duel-you"><small>방장 이름</small><strong>{withNim(hostName)}</strong></div>
    {waiting && <div className="duel-invite-steps" aria-label="친구 배틀 시작 순서"><span className="is-done"><b>1</b>방 생성</span><i /><span><b>2</b>친구 수락</span><i /><span><b>3</b>동시 시작</span></div>}
    {waiting && <div className="duel-invite-clock"><span>방 닫히기까지</span><strong>{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</strong><small>먼저 수락한 친구 한 명만 입장</small></div>}
    {phase === 'creating' ? <div className="duel-dots" aria-label="초대방 생성 중"><i /><i /><i /></div>
      : waiting ? <div className="duel-invite-actions"><button className="primary-button" onClick={onShare} disabled={busy}>{busy ? '공유창 여는 중…' : '친구 골라서 시비 걸기'} <span>↗</span></button><small className="duel-share-hint">카톡·문자 어디든 링크 하나면 입장</small><button className="secondary-button" onClick={onRandom} disabled={busy}>기다리기 싫으면 바로 매칭</button><button className="text-button" onClick={onCancel}>방 닫고 홈으로</button></div>
        : <div className="duel-invite-actions"><button className="primary-button" onClick={onCreate} disabled={busy}>새 초대장 만들기 <span>→</span></button><button className="secondary-button" onClick={onRandom}>랜덤 상대와 붙기</button><button className="text-button" onClick={onCancel}>홈으로</button></div>}
  </section>;
}
