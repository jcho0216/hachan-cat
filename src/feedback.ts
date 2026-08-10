type HapticType = 'tickWeak' | 'tap' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium' | 'success' | 'error' | 'wiggle' | 'confetti';

let audioContext: AudioContext | null = null;

function context() {
  if (typeof window === 'undefined') return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

export function playSound(kind: 'aim' | 'near' | 'miss' | 'hit' | 'catch' | 'phase', enabled: boolean) {
  if (!enabled || document.hidden) return;
  const ctx = context();
  if (!ctx) return;
  const notes: Record<typeof kind, Array<[number, number, number]>> = {
    aim: [[520, .025, .035]],
    near: [[310, .045, .055], [390, .04, .07]],
    miss: [[190, .08, .09], [135, .1, .12]],
    hit: [[240, .04, .06], [480, .06, .08]],
    catch: [[330, .05, .07], [520, .06, .09], [780, .09, .13]],
    phase: [[440, .025, .04], [590, .035, .06]],
  };
  let offset = 0;
  notes[kind].forEach(([frequency, duration, volume]) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = kind === 'miss' ? 'sawtooth' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + offset);
    gain.gain.setValueAtTime(volume, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + offset + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(ctx.currentTime + offset);
    oscillator.stop(ctx.currentTime + offset + duration);
    offset += duration * .72;
  });
}

export async function haptic(type: HapticType) {
  try {
    const bridge = await import('@apps-in-toss/web-framework') as unknown as {
      generateHapticFeedback?: ((options: { type: HapticType }) => Promise<void>) & { isSupported?: () => boolean };
    };
    const generate = bridge.generateHapticFeedback;
    if (generate && generate.isSupported?.() !== false) {
      await generate({ type });
      return;
    }
  } catch { /* 웹 미리보기에서는 진동 폴백을 사용한다. */ }
  const fallback: Partial<Record<HapticType, number | number[]>> = {
    tickWeak: 8, tap: 18, tickMedium: 28, softMedium: 22, basicWeak: 12,
    basicMedium: 35, wiggle: [15, 18, 15], error: [30, 25, 55],
    success: [35, 25, 80], confetti: [25, 18, 45, 18, 90],
  };
  navigator.vibrate?.(fallback[type] ?? 10);
}

export function pauseAudio() {
  if (audioContext?.state === 'running') void audioContext.suspend();
}
