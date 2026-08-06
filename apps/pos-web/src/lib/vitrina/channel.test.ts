import { describe, expect, it } from 'vitest';
import {
  publishVitrina,
  subscribeVitrina,
  vitrinaMessageForPhase,
  type VitrinaSnapshot,
} from './channel.js';

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
    expect(Array.isArray(snaps)).toBe(true);
  });

  it('mensajes de fase de pedido', () => {
    expect(vitrinaMessageForPhase('order_open', '3')).toContain('abierta');
    expect(vitrinaMessageForPhase('order_fired', '12')).toContain('cocina');
    expect(vitrinaMessageForPhase('order_ready', '12')).toContain('Listo');
    expect(vitrinaMessageForPhase('order_paid')).toContain('pagada');
    expect(vitrinaMessageForPhase('confirming')).toContain('Confirma');
    expect(vitrinaMessageForPhase('charged')).toContain('Cobrado');
    expect(vitrinaMessageForPhase('idle')).toContain('Esperando');
  });
});
