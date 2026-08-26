import { safeStorageGet, safeStorageSet } from '../storage';
import { cleanDuelNickname, duelNicknameError, randomDuelNickname } from './nicknameRules';
export { BATTLE_NAME_MAX_LENGTH, BATTLE_NAME_MIN_LENGTH, cleanDuelNickname, duelNicknameError, randomDuelNickname, withNim } from './nicknameRules';

const DEV_PLAYER_KEY = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('duel-player')?.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) : '';
const KEY = `hachan-cat-duel-nickname-v1${DEV_PLAYER_KEY ? `-${DEV_PLAYER_KEY}` : ''}`;
const CONFIRMED_KEY = `hachan-cat-duel-nickname-confirmed-v1${DEV_PLAYER_KEY ? `-${DEV_PLAYER_KEY}` : ''}`;
export function duelNickname(seed: string = crypto.randomUUID()) {
  const saved = safeStorageGet(KEY)?.trim();
  if (saved && !duelNicknameError(saved)) return cleanDuelNickname(saved);
  const nickname = randomDuelNickname(seed);
  safeStorageSet(KEY, nickname);
  return nickname;
}

export function isDuelNicknameConfirmed() {
  return safeStorageGet(CONFIRMED_KEY) === 'yes' && !duelNicknameError(safeStorageGet(KEY) ?? '');
}

export function saveDuelNickname(value: string) {
  const nickname = cleanDuelNickname(value);
  const error = duelNicknameError(nickname);
  if (error) throw new Error(error);
  safeStorageSet(KEY, nickname);
  safeStorageSet(CONFIRMED_KEY, 'yes');
  return nickname;
}
