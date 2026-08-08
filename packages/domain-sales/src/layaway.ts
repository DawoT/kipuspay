/**
 * Apartados — Arquitectura §5.3 regla 17 / ADR-0016. Puro, sin D1.
 * Cantidades en microunidades; dinero en cents. No emite CPE.
 */

import { assertReturnWithinWindow, type ReturnPolicy } from './returns.js';

export const LAYAWAY_ITEMS_REQUIRED = 'LAYAWAY_ITEMS_REQUIRED';
export const LAYAWAY_INVALID_AMOUNT = 'LAYAWAY_INVALID_AMOUNT';
export const LAYAWAY_DEPOSIT_EXCEEDS_BALANCE = 'LAYAWAY_DEPOSIT_EXCEEDS_BALANCE';
export const LAYAWAY_INVALID_STATUS = 'LAYAWAY_INVALID_STATUS';
export const LAYAWAY_INSUFFICIENT_DEPOSIT = 'LAYAWAY_INSUFFICIENT_DEPOSIT';
export const LAYAWAY_ALREADY_CONVERTED = 'LAYAWAY_ALREADY_CONVERTED';
export const LAYAWAY_ALREADY_TERMINAL = 'LAYAWAY_ALREADY_TERMINAL';

const QUANTITY_SCALE = 1_000_000;

export type LayawayStatus = 'OPEN' | 'OVERDUE' | 'CONVERTED' | 'CANCELLED';

export interface LayawayItemInput {
  readonly productId: string;
  readonly baseQuantityMicrounits: number;
  readonly unitPriceCents: number;
}

export interface LayawayCreatePlan {
  readonly status: 'OPEN';
  readonly snapshotTotalCents: number;
  readonly dueDateIso: string | null;
  readonly emitsFiscalDocument: false;
  readonly items: readonly LayawayItemInput[];
}

export interface LayawayDepositPlan {
  readonly amountCents: number;
  readonly balanceAfterCents: number;
  readonly emitsFiscalDocument: false;
}

export function computeLayawayBalanceCents(input: {
  readonly snapshotTotalCents: number;
  readonly paidCents: number;
}): number {
  assertNonNegCents(input.snapshotTotalCents, LAYAWAY_INVALID_AMOUNT);
  assertNonNegCents(input.paidCents, LAYAWAY_INVALID_AMOUNT);
  return input.snapshotTotalCents - input.paidCents;
}

export function planLayawayCreate(input: {
  readonly items: readonly LayawayItemInput[];
  readonly dueDateIso: string | null;
  readonly nowIso: string;
}): LayawayCreatePlan {
  if (input.items.length === 0) throw new Error(LAYAWAY_ITEMS_REQUIRED);
  let snapshotTotalCents = 0;
  for (const item of input.items) {
    if (!item.productId.trim()) throw new Error(LAYAWAY_ITEMS_REQUIRED);
    snapshotTotalCents += lineCents(item);
  }
  return {
    status: 'OPEN',
    snapshotTotalCents,
    dueDateIso: input.dueDateIso,
    emitsFiscalDocument: false,
    items: input.items,
  };
}

export function planLayawayDeposit(input: {
  readonly snapshotTotalCents: number;
  readonly alreadyPaidCents: number;
  readonly amountCents: number;
  readonly status: LayawayStatus;
}): LayawayDepositPlan {
  if (input.status === 'CANCELLED' || input.status === 'CONVERTED') {
    throw new Error(LAYAWAY_INVALID_STATUS);
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(LAYAWAY_INVALID_AMOUNT);
  }
  const balance = computeLayawayBalanceCents({
    snapshotTotalCents: input.snapshotTotalCents,
    paidCents: input.alreadyPaidCents,
  });
  if (input.amountCents > balance) throw new Error(LAYAWAY_DEPOSIT_EXCEEDS_BALANCE);
  return {
    amountCents: input.amountCents,
    balanceAfterCents: balance - input.amountCents,
    emitsFiscalDocument: false,
  };
}

export function assertLayawayConvertible(input: {
  readonly status: LayawayStatus;
  readonly snapshotTotalCents: number;
  readonly paidCents: number;
  readonly remainingAsCredit: boolean;
}): void {
  if (input.status === 'CONVERTED') throw new Error(LAYAWAY_ALREADY_CONVERTED);
  if (input.status === 'CANCELLED') throw new Error(LAYAWAY_INVALID_STATUS);
  const balance = computeLayawayBalanceCents({
    snapshotTotalCents: input.snapshotTotalCents,
    paidCents: input.paidCents,
  });
  if (balance > 0 && !input.remainingAsCredit) {
    throw new Error(LAYAWAY_INSUFFICIENT_DEPOSIT);
  }
}

export function assertLayawayCancelAllowed(input: {
  readonly status: LayawayStatus;
  readonly createdAtMs: number;
  readonly nowMs: number;
  readonly paymentMethod: string;
  readonly policy: ReturnPolicy;
}): void {
  if (input.status === 'CANCELLED' || input.status === 'CONVERTED') {
    throw new Error(LAYAWAY_ALREADY_TERMINAL);
  }
  assertReturnWithinWindow({
    issuedAtMs: input.createdAtMs,
    nowMs: input.nowMs,
    policy: input.policy,
    paymentMethod: input.paymentMethod,
  });
}

export function markLayawayOverdue(input: {
  readonly status: LayawayStatus;
  readonly dueDateIso: string | null;
  readonly nowIso: string;
}): LayawayStatus {
  if (input.status !== 'OPEN') return input.status;
  if (!input.dueDateIso) return 'OPEN';
  const today = input.nowIso.slice(0, 10);
  return today > input.dueDateIso ? 'OVERDUE' : 'OPEN';
}

function lineCents(item: LayawayItemInput): number {
  if (!Number.isInteger(item.baseQuantityMicrounits) || item.baseQuantityMicrounits <= 0) {
    throw new Error(LAYAWAY_INVALID_AMOUNT);
  }
  if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
    throw new Error(LAYAWAY_INVALID_AMOUNT);
  }
  return Math.floor(
    (item.baseQuantityMicrounits * item.unitPriceCents + QUANTITY_SCALE / 2) / QUANTITY_SCALE,
  );
}

function assertNonNegCents(n: number, code: string): void {
  if (!Number.isInteger(n) || n < 0) throw new Error(code);
}
