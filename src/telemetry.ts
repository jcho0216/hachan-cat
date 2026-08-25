const KEY = 'hachan-cat-events-v1';
type Properties = Record<string, string | number | boolean>;
type AnalyticsKind = 'click' | 'impression';

const CLICK_EVENTS = new Set([
  'game_start',
  'invalid_tap',
  'leaderboard_open',
  'loss_meme_save',
  'loss_meme_share',
  'meme_save',
  'meme_share',
  'native_back',
  'sound_toggle',
  'tutorial_start',
]);

export function analyticsKindFor(name: string): AnalyticsKind {
  return CLICK_EVENTS.has(name) ? 'click' : 'impression';
}

function remember(name: string, properties: Properties) {
  try {
    const events = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
    events.push({ name, properties, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-100)));
  } catch { /* 측정 실패가 플레이를 막지 않는다. */ }
}

async function send(name: string, properties: Properties, kind: AnalyticsKind) {
  try {
    const { Analytics } = await import('@apps-in-toss/web-framework');
    await Analytics[kind]({ log_name: name, ...properties });
  } catch { /* 웹 미리보기와 브리지 오류는 로컬 기록으로 대체한다. */ }
}

export function track(name: string, properties: Properties = {}) {
  remember(name, properties);
  void send(name, properties, analyticsKindFor(name));
}

export function trackScreen(name: string, properties: Properties = {}) {
  remember(`screen_${name}`, properties);
  try {
    void import('@apps-in-toss/web-framework')
      .then(({ Analytics }) => Analytics.screen({ log_name: name, ...properties }))
      .catch(() => undefined);
  } catch { /* 동적 로딩 자체가 불가능한 환경에서도 게임은 계속된다. */ }
}
