import { describe, expect, it } from 'vitest';
import {
  assertLoyaltyTransition,
  assertOfflineLoyaltyPolicy,
  assertPointsBalanceNonNegative,
  assertRedeemAuthorized,
  buildLoyaltyIdempotencyKey,
  LOYALTY_RESERVATION_EXPIRED,
} from './loyalty.js';

describe('loyalty', () => {
  it('transiciones RESERVED→REDEEMED|EXPIRED|CANCELLED', () => {
    expect(() => assertLoyaltyTransition('RESERVED', 'REDEEMED')).not.toThrow();
    expect(() => assertLoyaltyTransition('RESERVED', 'EXPIRED')).not.toThrow();
    expect(() => assertLoyaltyTransition('REDEEMED', 'EXPIRED')).toThrow('LOYALTY_INVALID');
  });

  it('idempotency key = sale key', () => {
    expect(buildLoyaltyIdempotencyKey('sale-1')).toBe('sale-1');
    expect(() => buildLoyaltyIdempotencyKey('  ')).toThrow('LOYALTY_IDEMPOTENCY_EMPTY');
  });

  it('canje exige authz', () => {
    expect(() => assertRedeemAuthorized(false)).toThrow('LOYALTY_AUTHZ_REQUIRED');
    expect(() => assertRedeemAuthorized(true)).not.toThrow();
  });

  it('offline-origin rechaza puntos', () => {
    expect(() =>
      assertOfflineLoyaltyPolicy({
        offlineOrigin: true,
        requestedPoints: 100,
        reservationStatus: null,
      }),
    ).toThrow('LOYALTY_OFFLINE_ORIGIN_DISABLED');
  });

  it('edge A: EXPIRED on retry → EXPIRED_ON_RETRY', () => {
    expect(
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 50,
        reservationStatus: 'EXPIRED',
      }),
    ).toBe('EXPIRED_ON_RETRY');
  });

  it('reserva vigente → REDEEM', () => {
    expect(
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 50,
        reservationStatus: 'RESERVED',
      }),
    ).toBe('REDEEM');
  });

  it('sin reserva con puntos → error', () => {
    expect(() =>
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 10,
        reservationStatus: null,
      }),
    ).toThrow('LOYALTY_RESERVATION_REQUIRED');
  });

  it('balance nunca negativo + audit code', () => {
    expect(() => assertPointsBalanceNonNegative(0)).not.toThrow();
    expect(() => assertPointsBalanceNonNegative(-1)).toThrow('LOYALTY_BALANCE_NEGATIVE');
    expect(LOYALTY_RESERVATION_EXPIRED).toBe('LOYALTY_RESERVATION_EXPIRED');
  });

  it('0 puntos es no-op REDEEM; puntos inválidos / CANCELLED', () => {
    expect(
      assertOfflineLoyaltyPolicy({
        offlineOrigin: true,
        requestedPoints: 0,
        reservationStatus: null,
      }),
    ).toBe('REDEEM');
    expect(() =>
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 1.5,
        reservationStatus: 'RESERVED',
      }),
    ).toThrow('LOYALTY_POINTS_INVALID');
    expect(() =>
      assertOfflineLoyaltyPolicy({
        offlineOrigin: false,
        requestedPoints: 5,
        reservationStatus: 'CANCELLED',
      }),
    ).toThrow('LOYALTY_RESERVATION_CANCELLED');
  });
});
