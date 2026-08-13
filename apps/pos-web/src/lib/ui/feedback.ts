/**
 * GTM §6.5 — feedback sensorial deliberado al completar una venta:
 * beep corto (Web Audio, sin assets) + vibración breve en móvil.
 * Opt-in por flag; jamás bloquea el cobro (fire-and-forget).
 */

let audioCtx: { currentTime: number; createOscillator(): unknown; createGain(): unknown; destination: unknown } | null = null;

export function supportsSaleFeedback(): boolean {
  try {
    return typeof AudioContext !== 'undefined' || typeof navigator?.vibrate === 'function';
  } catch {
    return false;
  }
}

export function playSaleSuccessFeedback(): void {
  try {
    if (typeof AudioContext !== 'undefined') {
      const fresh = new AudioContext() as unknown as {
        currentTime: number;
        createOscillator(): unknown;
        createGain(): unknown;
        destination: unknown;
      };
      audioCtx ??= fresh;
      const ctx = audioCtx;
      const oscillator = ctx.createOscillator() as {
        connect(node: unknown): void;
        start(time?: number): void;
        stop(time?: number): void;
        frequency: { setValueAtTime(value: number, time: number): void };
        type: string;
      };
      const gain = ctx.createGain() as {
        connect(node: unknown): void;
        disconnect(): void;
        gain: { setValueAtTime(value: number, time: number): void; exponentialRampToValueAtTime(value: number, time: number): void };
      };
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
      setTimeout(() => {
        try {
          gain.disconnect();
        } catch {
          // ya desconectado
        }
      }, 200);
    }
    if (typeof navigator?.vibrate === 'function') {
      navigator.vibrate([40, 60, 40]);
    }
  } catch {
    // El feedback nunca interrumpe la venta.
  }
}
