type GameCenterBridge = {
  submitGameCenterLeaderBoardScore?: ((options: { score: string }) => Promise<{ statusCode?: string } | undefined>) & { isSupported?: () => boolean };
  openGameCenterLeaderboard?: (() => Promise<void>) & { isSupported?: () => boolean };
  isMinVersionSupported?: (options: { android: string; ios: string }) => boolean;
};

export const GAME_CENTER_MIN_VERSION = '5.221.0';

async function bridge() {
  return await import('@apps-in-toss/web-framework') as unknown as GameCenterBridge;
}

export function normalizeLeaderboardScore(score: number) {
  return Math.max(0, Math.min(100_000, Math.round(Number.isFinite(score) ? score : 0)));
}

export function isLeaderboardVersionSupported(api: Pick<GameCenterBridge, 'isMinVersionSupported'>) {
  return api.isMinVersionSupported?.({ android: GAME_CENTER_MIN_VERSION, ios: GAME_CENTER_MIN_VERSION }) !== false;
}

export async function submitDailyScore(score: number) {
  try {
    const api = await bridge();
    if (!isLeaderboardVersionSupported(api)) return false;
    if (!api.submitGameCenterLeaderBoardScore || api.submitGameCenterLeaderBoardScore.isSupported?.() === false) return false;
    const result = await api.submitGameCenterLeaderBoardScore({ score: String(normalizeLeaderboardScore(score)) });
    return result?.statusCode === 'SUCCESS';
  } catch { return false; }
}

export async function openLeaderboard() {
  try {
    const api = await bridge();
    if (!isLeaderboardVersionSupported(api)) return false;
    if (!api.openGameCenterLeaderboard || api.openGameCenterLeaderboard.isSupported?.() === false) return false;
    await api.openGameCenterLeaderboard();
    return true;
  } catch { return false; }
}
