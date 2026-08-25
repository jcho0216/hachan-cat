type PersistentStorage = { setItem: (key: string, value: string) => Promise<void> };

let persistentStorage: PersistentStorage | null = null;

export function connectPersistentStorage(storage: PersistentStorage) {
  persistentStorage = storage;
}

export function safeStorageGet(key: string) {
  try { return globalThis.localStorage?.getItem(key) ?? null; }
  catch { return null; }
}

export function safeStorageSet(key: string, value: string) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, value);
    void persistentStorage?.setItem(key, value).catch(() => undefined);
    return true;
  }
  catch { return false; }
}
