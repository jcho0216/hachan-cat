import { CatCharacter } from './CatCharacter';

type Props = {
  nickname: string;
  onlineCount: number;
  phase: 'connecting' | 'waiting' | 'longwait' | 'error';
  onCancel: () => void;
  onPractice: () => void;
  onInvite: () => void;
};

const copy = {
  connecting: ['접속 중인 냥손 확인 중', '누가 먼저 약 오를지 고르는 중.'],
  waiting: ['진짜 상대 찾는 중', '기록 말고, 지금 접속한 사람만 찾습니다.'],
  longwait: ['지금 다들 고양이한테 짐', '조금 더 기다리거나 친구를 직접 끌고 오세요.'],
  error: ['온라인 냥문이 잠깐 닫힘', '혼자 놀기는 멀쩡합니다.'],
} as const;

export function DuelLobby({ nickname, onlineCount, phase, onCancel, onPractice, onInvite }: Props) {
  return <section className="duel-lobby-screen page-enter">
    <div className="duel-lobby-radar" aria-hidden="true"><i /><i /><i /></div>
    <span className="duel-live"><i />{onlineCount > 1 ? `${onlineCount}명 접속 중` : '상대 탐색 중'}</span>
    <h1>{copy[phase][0]}</h1>
    <p>{copy[phase][1]}</p>
    <div className="duel-search-cat"><CatCharacter pose={phase === 'error' ? 'butt' : phase === 'longwait' ? 'paddle' : 'peek'} evil={phase === 'longwait' ? 5 : 2} /><span>?</span></div>
    <div className="duel-you"><small>오늘의 이름</small><strong>{nickname}</strong></div>
    {phase === 'error' ? <button className="primary-button" onClick={onPractice}>혼자 연습하기 <span>→</span></button>
      : phase === 'longwait' ? <div className="duel-lobby-options"><button className="primary-button" onClick={onInvite}>친구 불러서 계속 붙기 <span>→</span></button><button className="secondary-button" onClick={onPractice}>혼자 연습하기</button></div>
        : <div className="duel-dots" aria-label="매칭 중"><i /><i /><i /></div>}
    <button className="text-button" onClick={onCancel}>{phase === 'error' ? '홈으로' : '매칭 취소'}</button>
  </section>;
}
