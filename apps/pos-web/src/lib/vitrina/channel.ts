/** Modo Vitrina — BroadcastChannel local (sin outbox S25). */

export const VITRINA_CHANNEL = 'kipuspay-vitrina';

export interface VitrinaSnapshot {
  readonly totalCents: number;
  readonly itemCount: number;
  readonly documentType: string;
  readonly phase: 'idle' | 'confirming' | 'charged';
  readonly message: string;
}

export function publishVitrina(snapshot: VitrinaSnapshot): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(VITRINA_CHANNEL);
  ch.postMessage(snapshot);
  ch.close();
}

export function subscribeVitrina(onSnap: (s: VitrinaSnapshot) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined;
  }
  const ch = new BroadcastChannel(VITRINA_CHANNEL);
  ch.onmessage = (ev: MessageEvent<VitrinaSnapshot>) => {
    onSnap(ev.data);
  };
  return () => ch.close();
}
