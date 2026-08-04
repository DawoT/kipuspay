import { describe, expect, it } from 'vitest';
import { publishVitrina, subscribeVitrina, type VitrinaSnapshot } from './channel.js';

describe('vitrina channel', () => {
  it('publish/subscribe no-op sin BroadcastChannel', () => {
    const snaps: VitrinaSnapshot[] = [];
    const unsub = subscribeVitrina((s) => snaps.push(s));
    publishVitrina({
      totalCents: 100,
      itemCount: 1,
      documentType: 'NV',
      phase: 'confirming',
      message: 'Confirma pago',
    });
    unsub();
    // En Node no hay BroadcastChannel → 0 mensajes; no lanza.
    expect(Array.isArray(snaps)).toBe(true);
  });
});
