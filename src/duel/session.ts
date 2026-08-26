const ACTIVE_SESSION_KEY = 'hachan-cat-active-duel-session-v1';
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export function readStoredDuelSessionId() {
  try {
    const value = window.sessionStorage.getItem(ACTIVE_SESSION_KEY) ?? '';
    return SESSION_ID_PATTERN.test(value) ? value : '';
  } catch { return ''; }
}

export function storeDuelSessionId(sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return;
  try { window.sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId); } catch { /* 재접속 복구는 부가 기능이다. */ }
}

export function clearStoredDuelSessionId() {
  try { window.sessionStorage.removeItem(ACTIVE_SESSION_KEY); } catch { /* 저장소가 막혀도 방 나가기는 계속한다. */ }
}
