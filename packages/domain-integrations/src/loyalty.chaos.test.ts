import { describe, expect, it } from 'vitest';
import { assertOfflineLoyaltyPolicy, assertLoyaltyTransition } from './loyalty.js';
import { assertWhatsAppOptIn } from './messaging.js';

describe('s24 chaos', () => {
  it('doble canje sobre REDEEMED falla', () => {
    expect(() =>
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 10,
        reservationStatus: 'REDEEMED',
      }),
    ).toThrow('LOYALTY_ALREADY_REDEEMED');
  });

  it('EXPIRED no se re-redime', () => {
    expect(() => assertLoyaltyTransition('EXPIRED', 'REDEEMED')).toThrow('LOYALTY_INVALID');
  });

  it('WhatsApp sin opt-in siempre rechazado', () => {
    expect(() => assertWhatsAppOptIn(false)).toThrow('WHATSAPP_OPT_IN_REQUIRED');
  });
});
