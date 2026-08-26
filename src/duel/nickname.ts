import { safeStorageGet, safeStorageSet } from '../storage';

const DEV_PLAYER_KEY = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('duel-player')?.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) : '';
const KEY = `hachan-cat-duel-nickname-v1${DEV_PLAYER_KEY ? `-${DEV_PLAYER_KEY}` : ''}`;
const FIRST = ['졸린', '약오른', '진심인', '날쌘', '뻔뻔한', '집요한', '손빠른', '씩씩한', '멍한', '성난'];
const SECOND = ['집사', '냥손', '수염꾼', '캔따개', '발바닥', '냥헌터', '손가락', '참치맨', '츄르단', '소파왕'];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function duelNickname(seed = crypto.randomUUID()) {
  const saved = safeStorageGet(KEY)?.trim();
  if (saved && saved.length >= 2 && saved.length <= 18) return saved;
  const value = hash(seed);
  const nickname = `${FIRST[value % FIRST.length]} ${SECOND[Math.floor(value / FIRST.length) % SECOND.length]}`;
  safeStorageSet(KEY, nickname);
  return nickname;
}
