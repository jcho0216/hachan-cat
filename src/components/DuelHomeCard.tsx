import type { DuelProfile } from '../duel/types';

type Props = {
  configured: boolean;
  onlineCount: number;
  profile: DuelProfile | null;
  onPlay: () => void;
  onInvite: () => void;
  onLeague: () => void;
};

export function DuelHomeCard({ configured, onlineCount, profile, onPlay, onInvite, onLeague }: Props) {
  const record = profile?.matches ? `${profile.wins}승 ${profile.losses}패${profile.currentStreak ? ` · ${profile.currentStreak}연승` : ''}` : '랭크 첫 판 대기 중';
  const friendRecord = profile?.friendMatches ? `친구전 ${profile.friendWins}승 ${profile.friendLosses}패` : '친구전 아직 없음';
  return <article className={`duel-home-card ${configured ? '' : 'is-offline'}`}>
    <header>
      <div><span className="duel-live"><i />{configured ? onlineCount > 1 ? `LIVE · ${onlineCount}명` : 'LIVE' : '준비 중'}</span><strong>온라인 냥탈전</strong></div>
      <button onClick={onLeague} disabled={!configured}>주간 리그 <span>›</span></button>
    </header>
    <div className="duel-mode-grid">
      <button className="duel-mode-card is-random" onClick={onPlay} disabled={!configured}>
        <span>⚡ 3초 매칭</span>
        <strong>바로 붙기</strong>
        <small>접속한 상대 · 없으면 고스트</small>
        <em>지금 대결 <b>→</b></em>
      </button>
      <button className="duel-mode-card is-friend" onClick={onInvite} disabled={!configured}>
        <span>1:1 · 링크 초대</span>
        <strong>친구 지목전</strong>
        <small>같은 고양이 · 정확히 동시 시작</small>
        <em>시비 걸기 <b>↗</b></em>
      </button>
    </div>
    <footer><span>{record}</span><i /> <span>{friendRecord}</span></footer>
  </article>;
}
