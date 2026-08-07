/**
 * Evidencia QG Sprint 27 — loyalty.reservations (§5.4).
 * Reusa reserva; offline origin off; EXPIRED_ON_RETRY.
 */
import { describe, expect, it } from 'vitest';
import {
  assertOfflineLoyaltyPolicy,
  buildLoyaltyIdempotencyKey,
  LOYALTY_RESERVATION_EXPIRED,
} from './loyalty.js';

describe('Sprint 27 loyalty QG', () => {
  it('reintento con misma key + RESERVED → REDEEM (reusa)', () => {
    const key = buildLoyaltyIdempotencyKey('offline-sale-abc');
    expect(key).toBe('offline-sale-abc');
    expect(
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 20,
        reservationStatus: 'RESERVED',
      }),
    ).toBe('REDEEM');
  });

  it('loyalty offline = off', () => {
    expect(() =>
      assertOfflineLoyaltyPolicy({
        offlineOrigin: true,
        requestedPoints: 10,
        reservationStatus: null,
      }),
    ).toThrow('LOYALTY_OFFLINE_ORIGIN_DISABLED');
  });

  it('reserva expirada en retry → EXPIRED_ON_RETRY + audit code', () => {
    expect(
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 10,
        reservationStatus: 'EXPIRED',
      }),
    ).toBe('EXPIRED_ON_RETRY');
    expect(LOYALTY_RESERVATION_EXPIRED).toBe('LOYALTY_RESERVATION_EXPIRED');
  });
});
