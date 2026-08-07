import { describe, expect, it } from 'vitest';
import {
  ARRANQUE_INCLUDED_QUOTA,
  countsTowardCupo,
  limaDayYmd,
  overageUnits,
  periodYmLima,
  planQuotaForPlanId,
  stripeOverageIdempotencyKey,
  usageKey,
} from './cupo.js';

describe('countsTowardCupo §4.1', () => {
  it.each(['01', '03', '07', '08', '12', 'NV', 'NV_RETURN'] as const)('%s cuenta +1', (doc) => {
    expect(countsTowardCupo(doc)).toBe(true);
  });

  it.each(['RC', 'VOID', 'BAJA', 'RC_VEHICLE'] as const)('%s no suma ni resta', (doc) => {
    expect(countsTowardCupo(doc)).toBe(false);
  });

  it('tipos desconocidos no cuentan', () => {
    expect(countsTowardCupo('99')).toBe(false);
  });
});

describe('usageKey / period / overage', () => {
  it('usageKey canónico', () => {
    expect(usageKey('sale-1')).toBe('usage:sale-1');
  });

  it('periodYmLima y limaDayYmd estables en Lima', () => {
    // 2026-08-07 05:00 UTC = 2026-08-07 00:00 Lima
    const ms = Date.UTC(2026, 7, 7, 5, 0, 0);
    expect(periodYmLima(ms)).toBe('2026-08');
    expect(limaDayYmd(ms)).toBe('2026-08-07');
  });

  it('overageUnits solo factura el excedente no reportado', () => {
    expect(overageUnits(500, 0)).toBe(0);
    expect(overageUnits(1000, 0)).toBe(0);
    expect(overageUnits(1005, 0)).toBe(5);
    expect(overageUnits(1005, 1000)).toBe(5);
    expect(overageUnits(1005, 1005)).toBe(0);
    expect(overageUnits(1010, 1005)).toBe(5);
    expect(overageUnits(900, 900)).toBe(0);
  });

  it('idempotency Stripe diaria', () => {
    expect(stripeOverageIdempotencyKey('t1', '2026-08', '2026-08-07')).toBe(
      't1:2026-08:2026-08-07',
    );
  });

  it('planQuota Arranque vs holgado', () => {
    expect(planQuotaForPlanId('arranque')).toBe(ARRANQUE_INCLUDED_QUOTA);
    expect(planQuotaForPlanId('crece')).toBeGreaterThan(ARRANQUE_INCLUDED_QUOTA);
  });
});
