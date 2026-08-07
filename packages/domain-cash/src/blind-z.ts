/**
 * Caja dura FASE 6 / Sprint 17 — puro (Arquitectura §5.3 reglas 2, 11, 12).
 * Dinero siempre INTEGER cents. Sin D1.
 */

export type Cents = number;

export type CashMovementType =
  'DEPOSIT_VALUES' | 'CHANGE_FUND_IN' | 'CHANGE_FUND_OUT' | 'SUPPLIER_PAYMENT' | 'ADJUSTMENT';

/** Tipos que suman al efectivo esperado (ingresos de caja). */
const INFLOW: ReadonlySet<CashMovementType> = new Set(['CHANGE_FUND_IN']);

/** Tipos que restan del efectivo esperado (retiros / egresos / envíos). */
const OUTFLOW: ReadonlySet<CashMovementType> = new Set([
  'DEPOSIT_VALUES',
  'CHANGE_FUND_OUT',
  'SUPPLIER_PAYMENT',
  'ADJUSTMENT',
]);

export interface CashMovementLine {
  readonly movementType: CashMovementType;
  readonly amountCents: Cents;
}

export interface ExpectedCashInput {
  readonly openingBalanceCents: Cents;
  readonly cashSalesCents: Cents;
  readonly movements: readonly CashMovementLine[];
  /** Egresos legacy (`cash_register_expenses`) que aún no migraron a movements. */
  readonly legacyExpenseCents?: Cents;
}

/**
 * expected = opening + ventas efectivo + ingresos − retiros − egresos
 * (Arquitectura §5.3 regla 11).
 */
export function computeExpectedCashCents(input: ExpectedCashInput): Cents {
  assertNonNeg(input.openingBalanceCents, 'INVALID_OPENING');
  assertNonNeg(input.cashSalesCents, 'INVALID_CASH_SALES');
  const legacy = input.legacyExpenseCents ?? 0;
  assertNonNeg(legacy, 'INVALID_LEGACY_EXPENSE');

  let inflows = 0;
  let outflows = 0;
  for (const m of input.movements) {
    assertPositive(m.amountCents, 'INVALID_MOVEMENT_AMOUNT');
    if (INFLOW.has(m.movementType)) inflows += m.amountCents;
    else if (OUTFLOW.has(m.movementType)) outflows += m.amountCents;
    else throw new Error(`UNKNOWN_MOVEMENT_TYPE:${m.movementType}`);
  }
  return input.openingBalanceCents + input.cashSalesCents + inflows - outflows - legacy;
}

export interface DenominationCount {
  readonly denominationCents: Cents;
  readonly quantity: number;
}

export function sumCountLines(lines: readonly DenominationCount[]): Cents {
  let total = 0;
  for (const line of lines) {
    assertPositive(line.denominationCents, 'INVALID_DENOMINATION');
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      throw new Error('INVALID_COUNT_QTY');
    }
    total += line.denominationCents * line.quantity;
  }
  return total;
}

export interface BlindCloseInput {
  readonly expectedCents: Cents;
  readonly countLines: readonly DenominationCount[];
  /** Umbral absoluto en cents; si |diff| > threshold exige reason. */
  readonly differenceThresholdCents: Cents;
  readonly differenceReason: string | null;
  /** En modo estricto exige al menos una línea de conteo. */
  readonly strictMode: boolean;
}

export interface BlindClosePlan {
  readonly countedTotalCents: Cents;
  readonly expectedTotalCents: Cents;
  readonly differenceAmountCents: Cents;
  readonly closedBlind: true;
  readonly requiresReason: boolean;
}

export function planBlindClose(input: BlindCloseInput): BlindClosePlan {
  assertNonNeg(input.expectedCents, 'INVALID_EXPECTED');
  assertNonNeg(input.differenceThresholdCents, 'INVALID_THRESHOLD');
  if (input.strictMode && input.countLines.length === 0) {
    throw new Error('BLIND_Z_REQUIRES_COUNT');
  }
  const countedTotalCents = sumCountLines(input.countLines);
  const differenceAmountCents = countedTotalCents - input.expectedCents;
  const requiresReason = Math.abs(differenceAmountCents) > input.differenceThresholdCents;
  if (requiresReason && !(input.differenceReason && input.differenceReason.trim())) {
    throw new Error('BLIND_Z_REASON_REQUIRED');
  }
  return {
    countedTotalCents,
    expectedTotalCents: input.expectedCents,
    differenceAmountCents,
    closedBlind: true,
    requiresReason,
  };
}

/**
 * Edge 2D: pending count del print outbox (S25).
 * El cliente envía PENDING+FAILED; el servidor solo valida y bloquea si > 0.
 */
export function printOutboxPendingCount(pendingCount = 0): number {
  if (!Number.isInteger(pendingCount) || pendingCount < 0) {
    throw new Error('INVALID_OUTBOX_PENDING');
  }
  return pendingCount;
}

export function shouldBlockZForPrintOutbox(pendingCount: number): boolean {
  return printOutboxPendingCount(pendingCount) > 0;
}

export interface DiscountPolicy {
  readonly maxPercentWithoutAuth: number;
  readonly maxAmountWithoutAuthCents: Cents;
}

export interface DiscountAuthzInput {
  readonly lineSubtotalCents: Cents;
  readonly discountCents: Cents;
  readonly policy: DiscountPolicy;
  readonly authorizationTokenHash: string | null;
}

/** true = requiere token; false = permitido sin authz. */
export function discountRequiresAuthz(input: DiscountAuthzInput): boolean {
  assertNonNeg(input.lineSubtotalCents, 'INVALID_SUBTOTAL');
  assertNonNeg(input.discountCents, 'INVALID_DISCOUNT');
  if (input.discountCents === 0) return false;
  if (input.discountCents > input.lineSubtotalCents) throw new Error('DISCOUNT_EXCEEDS_LINE');
  const { maxPercentWithoutAuth, maxAmountWithoutAuthCents } = input.policy;
  if (input.discountCents > maxAmountWithoutAuthCents) return true;
  if (input.lineSubtotalCents === 0) return input.discountCents > 0;
  const pct = (input.discountCents / input.lineSubtotalCents) * 100;
  return pct > maxPercentWithoutAuth;
}

export function assertDiscountAuthorized(input: DiscountAuthzInput): void {
  if (!discountRequiresAuthz(input)) return;
  if (!input.authorizationTokenHash || !input.authorizationTokenHash.trim()) {
    throw new Error('AUTH_TOKEN_REQUIRED');
  }
}

export interface CreditLimitInput {
  readonly creditLimitCents: Cents;
  readonly openArBalanceCents: Cents;
  readonly saleAmountCents: Cents;
  readonly creditOverrideTokenHash: string | null;
}

/**
 * Rechaza venta a crédito si open AR + venta > límite (salvo override token).
 * Código de error alineado a CA S17: CREDIT_LIMIT_EXCEEDED → 422 en adapter.
 */
export function assertCreditWithinLimit(input: CreditLimitInput): void {
  assertNonNeg(input.creditLimitCents, 'INVALID_CREDIT_LIMIT');
  assertNonNeg(input.openArBalanceCents, 'INVALID_AR_BALANCE');
  assertPositive(input.saleAmountCents, 'INVALID_SALE_AMOUNT');
  const projected = input.openArBalanceCents + input.saleAmountCents;
  if (projected <= input.creditLimitCents) return;
  if (input.creditOverrideTokenHash && input.creditOverrideTokenHash.trim()) return;
  throw new Error('CREDIT_LIMIT_EXCEEDED');
}

export interface SaleReprintPlan {
  readonly id: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly branchId: string;
  readonly printedByUserId: string;
  readonly copiedWatermark: 1;
  readonly reason: string | null;
}

export function planSaleReprint(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly branchId: string;
  readonly printedByUserId: string;
  readonly reason?: string | null;
}): SaleReprintPlan {
  if (!input.saleId.trim()) throw new Error('REPRINT_REQUIRES_SALE');
  return {
    id: input.id,
    tenantId: input.tenantId,
    saleId: input.saleId,
    branchId: input.branchId,
    printedByUserId: input.printedByUserId,
    copiedWatermark: 1,
    reason: input.reason ?? null,
  };
}

function assertPositive(n: Cents, code: string): void {
  if (!Number.isInteger(n) || n <= 0) throw new Error(code);
}

function assertNonNeg(n: Cents, code: string): void {
  if (!Number.isInteger(n) || n < 0) throw new Error(code);
}
