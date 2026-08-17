import { describe, expect, it } from 'vitest';
import { billingNoticeText } from './billing-notice.js';

describe('billing-notice (S9-A2 anti-apagado)', () => {
  it('sin billing → sin banner', () => {
    expect(billingNoticeText(null)).toBe('');
    expect(billingNoticeText(undefined)).toBe('');
  });

  it('trial/active → sin banner', () => {
    expect(
      billingNoticeText({
        subscriptionStatus: 'trial',
        trialEndsAt: '2026-09-01T00:00:00.000Z',
        pastGracePeriod: false,
      }),
    ).toBe('');
    expect(
      billingNoticeText({
        subscriptionStatus: 'active',
        trialEndsAt: null,
        pastGracePeriod: false,
      }),
    ).toBe('');
  });

  it('past_due en gracia → aviso de 3 días sin bloquear', () => {
    const msg = billingNoticeText({
      subscriptionStatus: 'past_due',
      trialEndsAt: null,
      pastGracePeriod: false,
    });
    expect(msg).toContain('Actualiza tu método de pago en los próximos 3 días');
    expect(msg).toContain('La caja sigue operando');
  });

  it('past_due post-gracia → aviso de gestión pausada, la caja sigue', () => {
    const msg = billingNoticeText({
      subscriptionStatus: 'past_due',
      trialEndsAt: null,
      pastGracePeriod: true,
    });
    expect(msg).toContain('la caja sigue operando');
    expect(msg).toContain('herramientas de gestión están pausadas');
  });

  it('canceled → mismo aviso fail-safe', () => {
    expect(
      billingNoticeText({
        subscriptionStatus: 'canceled',
        trialEndsAt: null,
        pastGracePeriod: false,
      }),
    ).toContain('3 días');
  });
});
