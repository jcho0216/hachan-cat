import type { DuelProfile } from '../duel/types';

type Props = {
  configured: boolean;
  onlineCount: number;
  profile: DuelProfile | null;
  nickname: string;
  onPlay: () => void;
  onInvite: () => void;
  onLeague: () => void;
  onEditName: () => void;
};

export function DuelHomeCard({ configured, onlineCount, profile, nickname, onPlay, onInvite, onLeague, onEditName }: Props) {
  const record = profile?.matches ? `${profile.wins}승 ${profile.losses}패${profile.currentStreak ? ` · ${profile.currentStreak}연승` : ''}` : '랭크 첫 판 대기 중';
  const friendRecord = profile?.friendMatches ? `친구전 ${profile.friendWins}승 ${profile.friendLosses}패` : '친구전 아직 없음';
  return <article className={`duel-home-card ${configured ? '' : 'is-offline'}`}>
    <header>
      <div><span className="duel-live"><i />{configured ? onlineCount > 1 ? `LIVE · ${onlineCount}명` : 'LIVE' : '준비 중'}</span><strong>온라인 냥탈전</strong></div>
      <div className="duel-home-tools"><button className="duel-name-chip" onClick={onEditName} disabled={!configured} aria-label={`배틀 이름 ${nickname}, 수정`}>{nickname}<span>✎</span></button><button onClick={onLeague} disabled={!configured}>리그 <span>›</span></button></div>
    </header>
    <div className="duel-mode-grid">
      <button className="duel-mode-card is-random" onClick={onPlay} disabled={!configured}>
        <span>⚡ 실시간 매칭</span>
        <strong>바로 붙기</strong>
        <small>지금 접속한 진짜 상대만</small>
        <em>지금 대결 <b>→</b></em>
      </button>
      <button className="duel-mode-card is-friend" onClick={onInvite} disabled={!configured}>
        <span>1:1 · 끝장 세션</span>
        <strong>친구 지목전</strong>
        <small>패자가 다음 냥이 · 나갈 때까지</small>
        <em>시비 걸기 <b>↗</b></em>
      </button>
    </div>
    <footer><span>{record}</span><i /> <span>{friendRecord}</span></footer>
  </article>;
}
