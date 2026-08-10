const KEY = 'hachan-cat-events-v1';

export function track(name: string, properties: Record<string, string | number | boolean> = {}) {
  try {
    const events = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
    events.push({ name, properties, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-100)));
  } catch { /* 측정 실패가 플레이를 막지 않는다. */ }
}
