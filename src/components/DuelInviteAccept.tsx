import { CatCharacter } from './CatCharacter';
import type { DuelInvitePreview } from '../duel/types';
import { withNim } from '../duel/nickname';
import { getLevel } from '../levels';
import { isTimedBossDuel } from '../duel/rules';

type Props = {
  preview: DuelInvitePreview;
  remainingSeconds: number;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCreate: () => void;
  onRetry: () => void;
};

const terminalCopy = {
  expired: ['친구가 너무 늦게 옴.', '초대장이 고양이보다 먼저 도망갔어요.'],
  cancelled: ['상대가 먼저 쫄았음.', '방장이 초대장을 접어버렸어요.'],
  full: ['이미 둘이 싸우는 중.', '이번 방은 고양이 한 마리, 사람 두 명으로 꽉 찼어요.'],
  busy: ['상대 손이 이미 바쁨.', '진행 중인 승부가 끝나면 새로 붙을 수 있어요.'],
  missing: ['정체불명 초대장.', '주소가 잘렸거나 이미 사라진 배틀이에요.'],
  error: ['초대장을 못 읽겠음.', '온라인 냥문이 잠깐 삐끗했어요.'],
} as const;

export function DuelInviteAccept({ preview, remainingSeconds, busy, onAccept, onDecline, onCreate, onRetry }: Props) {
  const ready = preview.state === 'ready' || preview.state === 'waiting';
  const loading = preview.state === 'loading';
  const terminal = !ready && !loading ? terminalCopy[preview.state as keyof typeof terminalCopy] ?? terminalCopy.error : null;
  const level = getLevel(preview.selectedLevel || 3);
  const timedBoss = isTimedBossDuel(level.hitsRequired);
  return <section className={`duel-invite-accept page-enter ${ready ? 'is-ready' : ''}`}>
    <span className="duel-invite-ticket">친구 냥탈전</span>
    <h1>{loading ? '초대장 펼치는 중' : ready ? <>{withNim(preview.hostName)},<br /><em>시비를 걸었음.</em></> : terminal?.[0]}</h1>
    <p>{loading ? '누가 얼마나 진심인지 확인 중.' : ready ? timedBoss ? `${level.name}은 60초 명중전. 더 많이 명중하면 1승, 먼저 5승하면 끝납니다.` : `${level.name}부터 시작. 한 판은 잡힐 때까지, 먼저 5승하면 끝납니다.` : terminal?.[1]}</p>
    <div className="duel-invite-cat"><CatCharacter pose={ready ? level.poses[0] : loading ? 'peek' : 'butt'} fur={ready ? level.fur : undefined} accent={ready ? level.accent : undefined} evil={ready ? level.evil : 3} /><span>{ready ? `Lv.${level.id}` : '?'}</span></div>
    {ready && <div className="duel-invite-versus"><div><small>도전자</small><strong>{withNim(preview.hostName)}</strong></div><b>VS</b><div><small>수락하면</small><strong>바로 동시 시작</strong></div></div>}
    {ready && <div className="duel-rule-chips"><span>{timedBoss ? '⏱ 60초 명중전' : '♾ 한 판 무제한'}</span><span>{timedBoss ? `☝ ${level.hitsRequired}번이면 즉시 승` : '☝ 잡으면 1승'}</span><span>🏆 먼저 5승</span></div>}
    {ready && <div className="duel-invite-expiry"><span>초대장 유효 시간</span><strong>{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</strong></div>}
    {loading ? <div className="duel-dots" aria-label="초대장 확인 중"><i /><i /><i /></div>
      : ready ? <div className="duel-invite-actions"><button className="primary-button" onClick={onAccept} disabled={busy}>{busy ? '자리 잡는 중…' : `${level.name}으로 시비 접수`} <span>→</span></button><button className="text-button" onClick={onDecline} disabled={busy}>못 본 척 홈으로</button></div>
        : <div className="duel-invite-actions"><button className="primary-button" onClick={onCreate} disabled={busy}>내가 새 배틀 열기 <span>→</span></button><button className="secondary-button" onClick={onRetry} disabled={busy}>초대장 다시 확인</button><button className="text-button" onClick={onDecline}>홈으로</button></div>}
  </section>;
}
