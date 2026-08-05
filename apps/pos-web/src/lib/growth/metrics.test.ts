import { describe, expect, it } from 'vitest';
import { computeGrowthMetrics, type GrowthEvent } from './metrics.js';

describe('growth metrics', () => {
  it('agrega TTFS p80, upgrade, activation, NRR n/d y K-factor', () => {
    const events: GrowthEvent[] = [
      { tenantId: 'a', eventType: 'onboarding_started', occurredAtIso: '2026-08-05T10:00:00.000Z' },
      { tenantId: 'a', eventType: 'first_sale', occurredAtIso: '2026-08-05T10:03:00.000Z' },
      { tenantId: 'b', eventType: 'onboarding_started', occurredAtIso: '2026-08-05T10:00:00.000Z' },
      { tenantId: 'b', eventType: 'first_sale', occurredAtIso: '2026-08-05T10:10:00.000Z' },
      {
        tenantId: 'a',
        eventType: 'formalization_upgrade',
        occurredAtIso: '2026-08-06T00:00:00.000Z',
      },
      { tenantId: 'a', eventType: 'trial_to_paid', occurredAtIso: '2026-09-01T00:00:00.000Z' },
      {
        tenantId: 'b',
        eventType: 'referral_credited',
        occurredAtIso: '2026-08-05T11:00:00.000Z',
        meta: { referrerTenantId: 'r1' },
      },
      {
        tenantId: 'c',
        eventType: 'referral_credited',
        occurredAtIso: '2026-08-05T12:00:00.000Z',
        meta: { referrerTenantId: 'r1' },
      },
    ];
    const snap = computeGrowthMetrics(events);
    expect(snap.ttfsSampleSize).toBe(2);
    expect(snap.ttfsMsP80).toBe(600_000);
    expect(snap.formalizationUpgradeRate).toBe(0.5);
    expect(snap.trialToPaidRate).toBe(0.5);
    expect(snap.nrrProxy).toBe('n/d');
    expect(snap.kFactor).toBe(2);
  });
});
