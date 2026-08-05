import { describe, expect, it } from 'vitest';
import {
  captureRef,
  createReferralStore,
  ensureReferralCode,
  onFirstSaleCredit,
} from './referral-store.js';

describe('referral-store E2E', () => {
  it('codigo → captura → first sale → credito bilateral sin double-grant', () => {
    const store = createReferralStore();
    const referrer = ensureReferralCode(store, 't_old');
    store.trials.set('t_old', { tenantId: 't_old', trialEndsAt: '2026-09-01T00:00:00.000Z' });
    store.trials.set('t_new', { tenantId: 't_new', trialEndsAt: '2026-09-01T00:00:00.000Z' });

    captureRef(store, {
      attributionId: 'attr1',
      referredTenantId: 't_new',
      code: referrer.code,
    });

    const now = '2026-08-05T12:00:00.000Z';
    const first = onFirstSaleCredit(store, 't_new', now);
    expect(first.credited).toBe(true);
    expect(store.trials.get('t_old')!.trialEndsAt).toBe('2026-10-01T00:00:00.000Z');
    expect(store.trials.get('t_new')!.trialEndsAt).toBe('2026-10-01T00:00:00.000Z');

    const second = onFirstSaleCredit(store, 't_new', now);
    expect(second.credited).toBe(false);
  });

  it('codigo invalido → error', () => {
    const store = createReferralStore();
    expect(() =>
      captureRef(store, { attributionId: 'a', referredTenantId: 't_x', code: 'NOPE' }),
    ).toThrow(/desconocido|invalido|coincide/i);
  });
});
