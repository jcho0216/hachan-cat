import type { DuelProfile } from '../duel/types';

type Props = {
  configured: boolean;
  onlineCount: number;
  profile: DuelProfile | null;
  onPlay: () => void;
  onLeague: () => void;
};

export function DuelHomeCard({ configured, onlineCount, profile, onPlay, onLeague }: Props) {
  return <article className={`duel-home-card ${configured ? '' : 'is-offline'}`}>
    <button className="duel-home-action" onClick={onPlay}>
      <span className="duel-live"><i />{configured ? onlineCount > 1 ? `LIVE · ${onlineCount}명 접속` : 'LIVE · 상대 찾는 중' : '온라인 준비 중'}</span>
      <strong>지금 접속한 사람과<br />먼저 잡기</strong>
      <small>{configured ? '3초 매칭 · 없으면 고스트 출전' : '연결 전에도 혼자 놀 수 있어요'}</small>
      <em>{configured ? '지금 붙기 →' : '곧 열림'}</em>
    </button>
    <footer>
      <span>{profile?.matches ? `${profile.wins}승 ${profile.losses}패 · ${profile.currentStreak ? `${profile.currentStreak}연승 중` : `최고 ${profile.bestStreak}연승`}` : '아직 전적 없음 · 첫 판이 역사'}</span>
      <button onClick={onLeague} disabled={!configured}>주간 냥손 리그 ›</button>
    </footer>
  </article>;
}
