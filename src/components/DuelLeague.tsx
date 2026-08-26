import type { DuelLeague as League, DuelProfile } from '../duel/types';

type Props = {
  league: League | null;
  profile: DuelProfile | null;
  status: 'loading' | 'ready' | 'error';
  onPlay: () => void;
  onBack: () => void;
  onRetry: () => void;
};

const time = (value: number | null) => value ? `${(value / 1000).toFixed(2)}초` : '기권승';

export function DuelLeague({ league, profile, status, onPlay, onBack, onRetry }: Props) {
  return <section className="duel-league-screen page-enter">
    <div className="duel-league-heading"><span className="kicker">월요일 0시 새 출발</span><h1>주간 냥손 리그</h1><p>실시간 승 3점 · 고스트 승 1점. 동점이면 최속승.</p></div>
    <div className="duel-profile-strip">
      <div><small>내 전적</small><strong>{profile?.matches ? `${profile.wins}승 ${profile.losses}패` : '첫 승부 대기'}</strong></div>
      <div><small>현재 / 최고 연승</small><strong>{profile ? `${profile.currentStreak} / ${profile.bestStreak}` : '— / —'}</strong></div>
      <div><small>내 주간 순위</small><strong>{league?.myRank ? `${league.myRank}위` : '첫 승 필요'}</strong></div>
    </div>
    {status === 'loading' && <div className="duel-league-empty"><i /><strong>이번 주 냥손 세는 중</strong><p>발바닥으로 하나씩 세고 있어요.</p></div>}
    {status === 'error' && <div className="duel-league-empty"><strong>순위표가 잠깐 숨었어요.</strong><p>대전은 정상적으로 할 수 있습니다.</p><button className="secondary-button" onClick={onRetry}>다시 불러오기</button></div>}
    {status === 'ready' && league && (league.players.length ? <ol className="duel-league-list">
      {league.players.map((player) => <li key={`${player.rank}-${player.nickname}`} className={player.isMe ? 'is-me' : ''}>
        <b>{player.rank <= 3 ? ['🥇','🥈','🥉'][player.rank - 1] : player.rank}</b><span><strong>{player.nickname}{player.isMe ? ' · 나' : ''}</strong><small>{player.wins}승 · 최속 {time(player.fastestWinMs)}</small></span><em>{player.points}점</em>
      </li>)}
    </ol> : <div className="duel-league-empty"><strong>이번 주 1등 자리 비었음.</strong><p>한 판 이기면 바로 이름을 올려요.</p></div>)}
    <div className="duel-league-actions"><button className="primary-button" onClick={onPlay}>순위 올리러 붙기 <span>→</span></button><button className="text-button" onClick={onBack}>홈으로</button></div>
  </section>;
}
