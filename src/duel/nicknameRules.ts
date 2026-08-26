const FIRST = ['졸린', '약오른', '진심인', '날쌘', '뻔뻔한', '집요한', '손빠른', '씩씩한', '멍한', '성난'];
const SECOND = ['집사', '냥손', '수염꾼', '캔따개', '발바닥', '냥헌터', '손가락', '참치맨', '츄르단', '소파왕'];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export const BATTLE_NAME_MIN_LENGTH = 2;
export const BATTLE_NAME_MAX_LENGTH = 10;

export function cleanDuelNickname(value: string) {
  return value.trim().replace(/[^0-9A-Za-z가-힣 _-]/g, '').replace(/\s+/g, ' ').slice(0, BATTLE_NAME_MAX_LENGTH).trim();
}

export function duelNicknameError(value: string) {
  const clean = cleanDuelNickname(value);
  if (clean.length < BATTLE_NAME_MIN_LENGTH) return '두 글자 이상 적어주세요.';
  if (/^(관리자|운영자|admin|toss|토스)$/i.test(clean.replace(/\s/g, ''))) return '이 이름은 사용할 수 없어요.';
  return '';
}

export function randomDuelNickname(seed: string = crypto.randomUUID()) {
  const value = hash(seed);
  return `${FIRST[value % FIRST.length]} ${SECOND[Math.floor(value / FIRST.length) % SECOND.length]}`;
}

export function withNim(value: string) {
  const clean = cleanDuelNickname(value) || '이름 없는 냥손';
  return clean.endsWith('님') ? clean : `${clean}님`;
}
