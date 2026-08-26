import { CatCharacter } from './CatCharacter';

type Props = {
  nickname: string;
  onlineCount: number;
  phase: 'connecting' | 'waiting' | 'ghost' | 'error';
  onCancel: () => void;
  onPractice: () => void;
};

const copy = {
  connecting: ['접속 중인 냥손 확인 중', '누가 먼저 약 오를지 고르는 중.'],
  waiting: ['상대 손가락 찾는 중', '3초 안에 없으면 고스트를 깨웁니다.'],
  ghost: ['고스트 기록 깨우는 중', '방금 전 누군가의 손놀림이 옵니다.'],
  error: ['온라인 냥문이 잠깐 닫힘', '혼자 놀기는 멀쩡합니다.'],
} as const;

export function DuelLobby({ nickname, onlineCount, phase, onCancel, onPractice }: Props) {
  return <section className="duel-lobby-screen page-enter">
    <div className="duel-lobby-radar" aria-hidden="true"><i /><i /><i /></div>
    <span className="duel-live"><i />{onlineCount > 1 ? `${onlineCount}명 접속 중` : '상대 탐색 중'}</span>
    <h1>{copy[phase][0]}</h1>
    <p>{copy[phase][1]}</p>
    <div className="duel-search-cat"><CatCharacter pose={phase === 'error' ? 'butt' : 'peek'} evil={phase === 'ghost' ? 5 : 2} /><span>?</span></div>
    <div className="duel-you"><small>오늘의 이름</small><strong>{nickname}</strong></div>
    {phase === 'error' ? <button className="primary-button" onClick={onPractice}>혼자 연습하기 <span>→</span></button>
      : <div className="duel-dots" aria-label="매칭 중"><i /><i /><i /></div>}
    <button className="text-button" onClick={onCancel}>{phase === 'error' ? '홈으로' : '매칭 취소'}</button>
  </section>;
}
