type GameCenterBridge = {
  submitGameCenterLeaderBoardScore?: ((options: { score: string }) => Promise<{ statusCode?: string } | undefined>) & { isSupported?: () => boolean };
  openGameCenterLeaderboard?: (() => Promise<void>) & { isSupported?: () => boolean };
};

async function bridge() {
  return await import('@apps-in-toss/web-framework') as unknown as GameCenterBridge;
}

export async function submitDailyScore(score: number) {
  try {
    const api = await bridge();
    if (!api.submitGameCenterLeaderBoardScore || api.submitGameCenterLeaderBoardScore.isSupported?.() === false) return false;
    const result = await api.submitGameCenterLeaderBoardScore({ score: String(Math.max(0, Math.round(score))) });
    return result?.statusCode === 'SUCCESS';
  } catch { return false; }
}

export async function openLeaderboard() {
  try {
    const api = await bridge();
    if (!api.openGameCenterLeaderboard || api.openGameCenterLeaderboard.isSupported?.() === false) return false;
    await api.openGameCenterLeaderboard();
    return true;
  } catch { return false; }
}
