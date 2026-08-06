/** Modo Vitrina — BroadcastChannel local (sin outbox S25). */

export const VITRINA_CHANNEL = 'kipuspay-vitrina';

export type VitrinaPhase =
  'idle' | 'confirming' | 'charged' | 'order_open' | 'order_fired' | 'order_ready' | 'order_paid';

export interface VitrinaSnapshot {
  readonly totalCents: number;
  readonly itemCount: number;
  readonly documentType: string;
  readonly phase: VitrinaPhase;
  readonly message: string;
  readonly brandLabel?: string;
  readonly brandUrl?: string;
  readonly tableLabel?: string;
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

/** Mensaje por defecto según fase de pedido/cobro. */
export function vitrinaMessageForPhase(phase: VitrinaPhase, tableLabel?: string): string {
  const mesa = tableLabel ? ` · Mesa ${tableLabel}` : '';
  switch (phase) {
    case 'order_open':
      return `Comanda abierta${mesa}`;
    case 'order_fired':
      return `En cocina${mesa}`;
    case 'order_ready':
      return `Listo para servir${mesa}`;
    case 'order_paid':
      return `Cuenta pagada${mesa}`;
    case 'confirming':
      return 'Confirma pago';
    case 'charged':
      return 'Cobrado';
    default:
      return 'Esperando…';
  }
}
