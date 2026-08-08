/**
 * Comisiones de vendedor — Arquitectura §5.3 regla 22 / ADR-0021 / COM-07.
 * Puro, sin D1. Tasa servidor. Nómina fuera de alcance.
 */

export const COMMISSION_SELLER_REQUIRED = 'COMMISSION_SELLER_REQUIRED';
export const COMMISSION_INVALID_AMOUNT = 'COMMISSION_INVALID_AMOUNT';
export const COMMISSION_INVALID_RATE = 'COMMISSION_INVALID_RATE';
export const COMMISSION_INVALID_STATUS = 'COMMISSION_INVALID_STATUS';
export const COMMISSION_ALREADY_PAID = 'COMMISSION_ALREADY_PAID';
export const COMMISSION_FORBIDDEN = 'COMMISSION_FORBIDDEN';
export const COMMISSION_NOTHING_TO_PAY = 'COMMISSION_NOTHING_TO_PAY';
export const COMMISSION_PAYROLL_FORBIDDEN = 'COMMISSION_PAYROLL_FORBIDDEN';

export type CommissionPayoutStatus = 'OPEN' | 'PAID' | 'VOID';

export interface CommissionRateRow {
  readonly sellerId: string;
  readonly productId: string | null;
  readonly categoryId: string | null;
  readonly ratePercent: number;
  readonly rateAmountCents: number | null;
}

export interface CommissionLineInput {
  readonly productId: string | null;
  readonly categoryId: string | null;
  readonly lineTotalCents: number;
}

export interface CommissionAccrualPlan {
  readonly sellerId: string;
  readonly amountCents: number;
  readonly emitsPayroll: false;
}

export interface CommissionPayoutPlan {
  readonly sellerId: string;
  readonly periodStartIso: string;
  readonly periodEndIso: string;
  readonly grossCents: number;
  readonly status: 'OPEN';
  readonly clientGrossIgnored: true;
  readonly emitsPayroll: false;
}

function assertPositiveCents(amount: number, code: string): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(code);
}

function assertNonNegCents(amount: number, code: string): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(code);
}

/** Half-up percent of base → INTEGER cents. */
export function applyCommissionPercentCents(baseCents: number, ratePercent: number): number {
  if (!Number.isInteger(baseCents) || baseCents < 0) throw new Error(COMMISSION_INVALID_AMOUNT);
  if (!Number.isFinite(ratePercent) || ratePercent < 0) throw new Error(COMMISSION_INVALID_RATE);
  return Math.floor((baseCents * ratePercent) / 100 + 0.5);
}

/**
 * Match más específico: seller+product → seller+category → seller default.
 */
export function resolveCommissionRate(
  rates: readonly CommissionRateRow[],
  sellerId: string,
  productId: string | null,
  categoryId: string | null,
): CommissionRateRow | null {
  if (!sellerId.trim()) return null;
  const forSeller = rates.filter((r) => r.sellerId === sellerId);
  if (productId) {
    const byProduct = forSeller.find((r) => r.productId === productId);
    if (byProduct) return byProduct;
  }
  if (categoryId) {
    const byCat = forSeller.find((r) => r.productId == null && r.categoryId === categoryId);
    if (byCat) return byCat;
  }
  return forSeller.find((r) => r.productId == null && r.categoryId == null) ?? null;
}

export function lineCommissionCents(rate: CommissionRateRow, lineTotalCents: number): number {
  assertNonNegCents(lineTotalCents, COMMISSION_INVALID_AMOUNT);
  if (rate.rateAmountCents != null) {
    assertNonNegCents(rate.rateAmountCents, COMMISSION_INVALID_RATE);
    return rate.rateAmountCents;
  }
  return applyCommissionPercentCents(lineTotalCents, rate.ratePercent);
}

/** 1 accrual por (sale, seller): suma líneas. Sin seller → null (0 accrual). */
export function planCommissionAccrual(input: {
  readonly sellerId: string | null | undefined;
  readonly lines: readonly CommissionLineInput[];
  readonly rates: readonly CommissionRateRow[];
}): CommissionAccrualPlan | null {
  if (!input.sellerId?.trim()) return null;
  let amountCents = 0;
  for (const line of input.lines) {
    const rate = resolveCommissionRate(
      input.rates,
      input.sellerId,
      line.productId,
      line.categoryId,
    );
    if (!rate) continue;
    amountCents += lineCommissionCents(rate, line.lineTotalCents);
  }
  if (amountCents <= 0) return null;
  return {
    sellerId: input.sellerId.trim(),
    amountCents,
    emitsPayroll: false,
  };
}

export function planCommissionReverse(input: {
  readonly amountCents: number;
  readonly alreadyReversed: boolean;
}): { readonly reverse: boolean; readonly amountCents: number } {
  if (input.alreadyReversed) return { reverse: false, amountCents: 0 };
  assertPositiveCents(input.amountCents, COMMISSION_INVALID_AMOUNT);
  return { reverse: true, amountCents: input.amountCents };
}

export function planCommissionPayout(input: {
  readonly sellerId: string;
  readonly periodStartIso: string;
  readonly periodEndIso: string;
  readonly openAccrualCents: number;
  readonly actorIsAdminOrOwner: boolean;
  readonly clientGrossCents?: number;
}): CommissionPayoutPlan {
  if (!input.actorIsAdminOrOwner) throw new Error(COMMISSION_FORBIDDEN);
  if (!input.sellerId.trim()) throw new Error(COMMISSION_SELLER_REQUIRED);
  if (!input.periodStartIso.trim() || !input.periodEndIso.trim()) {
    throw new Error(COMMISSION_INVALID_AMOUNT);
  }
  if (input.periodEndIso.slice(0, 10) < input.periodStartIso.slice(0, 10)) {
    throw new Error(COMMISSION_INVALID_AMOUNT);
  }
  assertNonNegCents(input.openAccrualCents, COMMISSION_INVALID_AMOUNT);
  if (input.openAccrualCents <= 0) throw new Error(COMMISSION_NOTHING_TO_PAY);
  void input.clientGrossCents;
  return {
    sellerId: input.sellerId.trim(),
    periodStartIso: input.periodStartIso.slice(0, 10),
    periodEndIso: input.periodEndIso.slice(0, 10),
    grossCents: input.openAccrualCents,
    status: 'OPEN',
    clientGrossIgnored: true,
    emitsPayroll: false,
  };
}

export function assertCommissionPayable(input: {
  readonly status: CommissionPayoutStatus;
  readonly actorIsAdminOrOwner: boolean;
}): void {
  if (!input.actorIsAdminOrOwner) throw new Error(COMMISSION_FORBIDDEN);
  if (input.status === 'PAID') throw new Error(COMMISSION_ALREADY_PAID);
  if (input.status !== 'OPEN') throw new Error(COMMISSION_INVALID_STATUS);
}

export function assertCommissionVoidable(input: {
  readonly status: CommissionPayoutStatus;
  readonly actorIsAdminOrOwner: boolean;
}): void {
  if (!input.actorIsAdminOrOwner) throw new Error(COMMISSION_FORBIDDEN);
  if (input.status !== 'OPEN') throw new Error(COMMISSION_INVALID_STATUS);
}

/** Nómina / planilla / retenciones laborales = fuera de alcance. */
export function assertCommissionNotPayroll(): void {
  throw new Error(COMMISSION_PAYROLL_FORBIDDEN);
}
