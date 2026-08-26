import { shareWithFallback } from '../share';
import type { DuelOutcome } from './types';
import { withNim } from './nickname';

const APP_URL = 'https://hachan-cat.vercel.app/';
const ACTIVE_INVITE_KEY = 'hachan-cat-active-invite-v1';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,40}$/;

function normalizedParams(search: string) {
  const params = new URLSearchParams(search);
  const packed = params.get('queryParams');
  if (!packed) return params;
  try {
    const parsed = JSON.parse(decodeURIComponent(packed)) as Record<string, string | number>;
    Object.entries(parsed).forEach(([key, value]) => params.set(key, String(value)));
  } catch { /* 직접 쿼리 파라미터를 사용한다. */ }
  return params;
}

export function parseBattleInviteToken(search: string) {
  const token = normalizedParams(search).get('battle')?.trim() ?? '';
  return TOKEN_PATTERN.test(token) ? token : '';
}

export function readStoredBattleInviteToken() {
  try {
    const token = window.sessionStorage.getItem(ACTIVE_INVITE_KEY) ?? '';
    return TOKEN_PATTERN.test(token) ? token : '';
  } catch { return ''; }
}

export function storeBattleInviteToken(token: string) {
  if (!TOKEN_PATTERN.test(token)) return;
  try { window.sessionStorage.setItem(ACTIVE_INVITE_KEY, token); } catch { /* 재접속 복구는 부가 기능이다. */ }
}

export function clearBattleInviteToken() {
  try { window.sessionStorage.removeItem(ACTIVE_INVITE_KEY); } catch { /* 저장소가 막혀도 현재 판은 계속한다. */ }
}

export function stripBattleInviteFromUrl() {
  const url = new URL(window.location.href);
  let changed = url.searchParams.has('battle');
  url.searchParams.delete('battle');
  const packed = url.searchParams.get('queryParams');
  if (packed) {
    try {
      const parsed = JSON.parse(decodeURIComponent(packed)) as Record<string, unknown>;
      if ('battle' in parsed) {
        delete parsed.battle;
        changed = true;
        if (Object.keys(parsed).length) url.searchParams.set('queryParams', JSON.stringify(parsed));
        else url.searchParams.delete('queryParams');
      }
    } catch { /* 손상된 포장 파라미터는 그대로 둔다. */ }
  }
  if (changed) window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function createBattleInviteWebUrl(token: string) {
  return `${APP_URL}?battle=${encodeURIComponent(token)}`;
}

export function createBattleInviteDeepLink(token: string) {
  return `intoss://hachan-cat/battle?battle=${encodeURIComponent(token)}`;
}

function invitationMessage(hostName: string, outcome: DuelOutcome | null) {
  const displayName = withNim(hostName);
  if (!outcome) return `${displayName}이 냥탈전을 걸었음 😼\n도망갈 시간 2분 줌. 링크 열고 직접 붙자.`;
  if (outcome.match.isDraw) return `${displayName}, 무승부는 못 참겠대 😾\n이번엔 둘 중 한 명은 꼭 고양이 잡기. 2분 안에 들어와.`;
  if (outcome.match.didWin) return `${displayName}, 이기고 바로 시비 거는 중 😼\n말로 말고 같은 고양이로 붙자. 2분 안에 입장.`;
  return `${displayName}, 방금 패배가 억울해서 복수전 엶 😿\n2분 안에 들어와. 이번엔 진짜 동시 시작.`;
}

export async function shareBattleInvite(token: string, hostName: string, outcome: DuelOutcome | null = null) {
  const webUrl = createBattleInviteWebUrl(token);
  return shareWithFallback(
    '하찮냥 친구 냥탈전',
    invitationMessage(hostName, outcome),
    webUrl,
    createBattleInviteDeepLink(token),
  );
}
