export class ShareCancelledError extends Error {
  constructor() { super('공유 취소'); this.name = 'ShareCancelledError'; }
}

export const SHARE_MIN_VERSION = { android: '5.220.0', ios: '5.221.0' } as const;
type AppVersion = `${number}.${number}.${number}` | 'always' | 'never';

export function isNativeShareVersionSupported(checker?: (versions: { android: AppVersion; ios: AppVersion }) => boolean) {
  return checker?.(SHARE_MIN_VERSION) !== false;
}

export function isShareCancellation(error: unknown) {
  if (error instanceof ShareCancelledError) return true;
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; message?: unknown; code?: unknown };
  const detail = `${String(value.name ?? '')} ${String(value.message ?? '')} ${String(value.code ?? '')}`;
  return /abort|cancel|취소|dismiss|user.?denied/i.test(detail);
}
