export function safeStorageGet(key: string) {
  try { return globalThis.localStorage?.getItem(key) ?? null; }
  catch { return null; }
}

export function safeStorageSet(key: string, value: string) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  }
  catch { return false; }
}
