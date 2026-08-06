/**
 * Sprint 24 — loyalty.points (§5.4 regla 6 + edge A).
 * Offline-originado: deshabilitado. Solo RESERVED online → REDEEMED / EXPIRED.
 */

export type LoyaltyReservationStatus = 'RESERVED' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';

export type OfflineLoyaltyOutcome = 'REDEEM' | 'EXPIRED_ON_RETRY' | 'REJECT_OFFLINE_ORIGIN';

const TRANSITIONS: Readonly<Record<LoyaltyReservationStatus, readonly LoyaltyReservationStatus[]>> =
  {
    RESERVED: ['REDEEMED', 'EXPIRED', 'CANCELLED'],
    REDEEMED: [],
    EXPIRED: [],
    CANCELLED: [],
  };

export function assertLoyaltyTransition(
  from: LoyaltyReservationStatus,
  to: LoyaltyReservationStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`LOYALTY_INVALID:${from}->${to}`);
  }
}

/** UNIQUE (tenant_id, sale_idempotency_key) — la key de venta es la de reserva. */
export function buildLoyaltyIdempotencyKey(saleIdempotencyKey: string): string {
  const key = saleIdempotencyKey.trim();
  if (!key) throw new Error('LOYALTY_IDEMPOTENCY_EMPTY');
  return key;
}

export function assertRedeemAuthorized(hasAuthzToken: boolean): void {
  if (!hasAuthzToken) throw new Error('LOYALTY_AUTHZ_REQUIRED');
}

/**
 * Offline-origin + puntos → reject.
 * Online reserve EXPIRED on offline retry → EXPIRED_ON_RETRY (commit sin puntos).
 * Online reserve still RESERVED → REDEEM.
 */
export function assertOfflineLoyaltyPolicy(input: {
  readonly offlineOrigin: boolean;
  readonly requestedPoints: number;
  readonly reservationStatus: LoyaltyReservationStatus | null;
}): OfflineLoyaltyOutcome {
  if (input.requestedPoints < 0 || !Number.isInteger(input.requestedPoints)) {
    throw new Error('LOYALTY_POINTS_INVALID');
  }
  if (input.requestedPoints === 0) {
    return 'REDEEM';
  }
  if (input.offlineOrigin) {
    throw new Error('LOYALTY_OFFLINE_ORIGIN_DISABLED');
  }
  if (input.reservationStatus === 'EXPIRED') {
    return 'EXPIRED_ON_RETRY';
  }
  if (input.reservationStatus === 'RESERVED') {
    return 'REDEEM';
  }
  if (input.reservationStatus === 'REDEEMED') {
    throw new Error('LOYALTY_ALREADY_REDEEMED');
  }
  if (input.reservationStatus === 'CANCELLED') {
    throw new Error('LOYALTY_RESERVATION_CANCELLED');
  }
  throw new Error('LOYALTY_RESERVATION_REQUIRED');
}

export function assertPointsBalanceNonNegative(balance: number): void {
  if (!Number.isInteger(balance) || balance < 0) {
    throw new Error('LOYALTY_BALANCE_NEGATIVE');
  }
}

export const LOYALTY_RESERVATION_EXPIRED = 'LOYALTY_RESERVATION_EXPIRED' as const;
