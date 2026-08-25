import { SafeAreaInsets, Storage, getAnonymousKey } from '@apps-in-toss/web-framework';
import { connectPersistentStorage } from './storage';

const USER_KEY = 'hachan-cat-user-key-v1';
const PERSISTED_KEYS = [
  'hachan-cat-collection-v1',
  'hachan-cat-caught-levels-v1',
  'hachan-cat-level-v1',
  'hachan-cat-selected-level-v1',
  'hachan-cat-caught-levels-v2',
  'hachan-cat-level-v2',
  'hachan-cat-selected-level-v2',
  'hachan-cat-sound-v1',
  'hachan-cat-first-play-v1',
  'hachan-cat-level-bests-v1',
  'hachan-cat-daily-best-v2',
  'hachan-cat-daily-history-v1',
] as const;

const isAppsInToss = () => typeof window !== 'undefined'
  && 'ReactNativeWebView' in window
  && '__GRANITE_NATIVE_EMITTER' in window;

function settleWithin<T>(promise: Promise<T>, fallback: T, timeoutMs = 1500) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

export async function prepareAppsInToss() {
  if (!isAppsInToss()) return;

  const [nativeValues, userKey] = await Promise.all([
    Promise.all(PERSISTED_KEYS.map((key) => settleWithin(Storage.getItem(key), null))),
    settleWithin(getAnonymousKey(), undefined),
  ]);
  const migrations: Promise<unknown>[] = [];

  PERSISTED_KEYS.forEach((key, index) => {
    const nativeValue = nativeValues[index];
    const webValue = localStorage.getItem(key);
    if (nativeValue !== null) localStorage.setItem(key, nativeValue);
    else if (webValue !== null) migrations.push(Storage.setItem(key, webValue).catch(() => undefined));
  });

  if (userKey && userKey !== 'ERROR' && userKey.type === 'HASH') {
    localStorage.setItem(USER_KEY, userKey.hash);
    migrations.push(Storage.setItem(USER_KEY, userKey.hash).catch(() => undefined));
  }

  connectPersistentStorage(Storage);
  void Promise.all(migrations);
}

function applyInsets(insets: { top: number; right: number; bottom: number; left: number }) {
  const root = document.documentElement.style;
  root.setProperty('--ait-safe-top', `${Math.max(0, insets.top)}px`);
  root.setProperty('--ait-safe-right', `${Math.max(0, insets.right)}px`);
  root.setProperty('--ait-safe-bottom', `${Math.max(0, insets.bottom)}px`);
  root.setProperty('--ait-safe-left', `${Math.max(0, insets.left)}px`);
}

export function startSafeAreaSync() {
  if (!isAppsInToss()) return () => undefined;
  try {
    document.documentElement.style.setProperty('--ait-nav-reserve', '58px');
    applyInsets(SafeAreaInsets.get());
    return SafeAreaInsets.subscribe({ onEvent: applyInsets });
  } catch {
    return () => undefined;
  }
}
