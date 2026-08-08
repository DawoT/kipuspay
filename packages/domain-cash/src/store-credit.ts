/**
 * Crédito de tienda / vales / gift cards — Arquitectura §5.3 regla 20 / ADR-0019.
 * Puro, sin D1. INTEGER cents. Saldo solo servidor. 0 canje offline.
 */

export const STORE_CREDIT_CUSTOMER_REQUIRED = 'STORE_CREDIT_CUSTOMER_REQUIRED';
export const STORE_CREDIT_INSUFFICIENT = 'STORE_CREDIT_INSUFFICIENT';
export const STORE_CREDIT_OFFLINE = 'STORE_CREDIT_OFFLINE';
export const STORE_CREDIT_FORBIDDEN = 'STORE_CREDIT_FORBIDDEN';
export const STORE_CREDIT_INVALID_AMOUNT = 'STORE_CREDIT_INVALID_AMOUNT';
export const STORE_CREDIT_EXPIRED = 'STORE_CREDIT_EXPIRED';
export const STORE_CREDIT_AUTH_REQUIRED = 'STORE_CREDIT_AUTH_REQUIRED';
export const STORE_CREDIT_SOURCE_REQUIRED = 'STORE_CREDIT_SOURCE_REQUIRED';
export const STORE_CREDIT_NC_NOT_ELIGIBLE = 'STORE_CREDIT_NC_NOT_ELIGIBLE';

export type StoreCreditTxnType = 'ISSUE' | 'REDEEM' | 'EXPIRE' | 'ADJUST';
export type StoreCreditAdjustSign = 'CREDIT' | 'DEBIT';

export interface StoreCreditIssuePlan {
  readonly type: 'ISSUE';
  readonly amountCents: number;
  readonly nextBalanceCents: number;
  readonly emitsFiscalDocument: true;
  readonly sourceRef: string;
}

export interface StoreCreditRedeemPlan {
  readonly type: 'REDEEM';
  readonly appliedCents: number;
  readonly clientAmountIgnored: true;
  readonly nextBalanceCents: number;
  readonly sourceRef: string;
}

export interface StoreCreditExpirePlan {
  readonly type: 'EXPIRE';
  readonly amountCents: number;
  readonly nextBalanceCents: 0;
}

export interface StoreCreditAdjustPlan {
  readonly type: 'ADJUST';
  readonly adjustSign: StoreCreditAdjustSign;
  readonly amountCents: number;
  readonly nextBalanceCents: number;
}

export function giftCardSaleSourceRef(saleId: string): string {
  if (!saleId.trim()) throw new Error(STORE_CREDIT_SOURCE_REQUIRED);
  return `gift_card_sale:${saleId.trim()}`;
}

export function ncStoreCreditSourceRef(returnId: string): string {
  if (!returnId.trim()) throw new Error(STORE_CREDIT_SOURCE_REQUIRED);
  return `nc:${returnId.trim()}`;
}

export function redeemStoreCreditSourceRef(saleId: string): string {
  if (!saleId.trim()) throw new Error(STORE_CREDIT_SOURCE_REQUIRED);
  return `redeem:${saleId.trim()}`;
}

function assertPositiveCents(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(STORE_CREDIT_INVALID_AMOUNT);
  }
}

function assertNonNegativeCents(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(STORE_CREDIT_INVALID_AMOUNT);
  }
}

export function planStoreCreditIssue(input: {
  readonly customerId: string | null | undefined;
  readonly currentBalanceCents: number;
  readonly amountCents: number;
  readonly sourceRef: string;
}): StoreCreditIssuePlan {
  if (!input.customerId?.trim()) throw new Error(STORE_CREDIT_CUSTOMER_REQUIRED);
  if (!input.sourceRef.trim()) throw new Error(STORE_CREDIT_SOURCE_REQUIRED);
  assertPositiveCents(input.amountCents);
  assertNonNegativeCents(input.currentBalanceCents);
  return {
    type: 'ISSUE',
    amountCents: input.amountCents,
    nextBalanceCents: input.currentBalanceCents + input.amountCents,
    emitsFiscalDocument: true,
    sourceRef: input.sourceRef.trim(),
  };
}

export function assertStoreCreditRedeemable(input: {
  readonly customerId: string | null | undefined;
  readonly online: boolean;
  readonly actorIsAdminOrOwner: boolean;
  readonly balanceCents: number;
  readonly remainingDueCents: number;
  readonly clientAmountCents?: number;
  readonly expiresAtMs?: number | null;
  readonly nowMs: number;
  readonly saleId: string;
}): StoreCreditRedeemPlan {
  if (!input.online) throw new Error(STORE_CREDIT_OFFLINE);
  if (!input.actorIsAdminOrOwner) throw new Error(STORE_CREDIT_FORBIDDEN);
  if (!input.customerId?.trim()) throw new Error(STORE_CREDIT_CUSTOMER_REQUIRED);
  assertNonNegativeCents(input.balanceCents);
  assertNonNegativeCents(input.remainingDueCents);
  if (input.expiresAtMs != null && input.expiresAtMs <= input.nowMs && input.balanceCents > 0) {
    throw new Error(STORE_CREDIT_EXPIRED);
  }
  const appliedCents = Math.min(input.balanceCents, input.remainingDueCents);
  if (appliedCents <= 0) throw new Error(STORE_CREDIT_INSUFFICIENT);
  void input.clientAmountCents;
  return {
    type: 'REDEEM',
    appliedCents,
    clientAmountIgnored: true,
    nextBalanceCents: input.balanceCents - appliedCents,
    sourceRef: redeemStoreCreditSourceRef(input.saleId),
  };
}

export function planStoreCreditExpire(input: {
  readonly balanceCents: number;
  readonly expiresAtMs: number | null | undefined;
  readonly nowMs: number;
}): StoreCreditExpirePlan {
  assertNonNegativeCents(input.balanceCents);
  if (input.balanceCents === 0) throw new Error(STORE_CREDIT_INVALID_AMOUNT);
  if (input.expiresAtMs == null || input.expiresAtMs > input.nowMs) {
    throw new Error(STORE_CREDIT_EXPIRED);
  }
  return { type: 'EXPIRE', amountCents: input.balanceCents, nextBalanceCents: 0 };
}

export function planStoreCreditAdjust(input: {
  readonly currentBalanceCents: number;
  readonly amountCents: number;
  readonly adjustSign: StoreCreditAdjustSign;
  readonly authorizedByUserId: string | null | undefined;
}): StoreCreditAdjustPlan {
  assertPositiveCents(input.amountCents);
  if (!input.authorizedByUserId?.trim()) throw new Error(STORE_CREDIT_AUTH_REQUIRED);
  assertNonNegativeCents(input.currentBalanceCents);
  const nextBalanceCents =
    input.adjustSign === 'CREDIT'
      ? input.currentBalanceCents + input.amountCents
      : input.currentBalanceCents - input.amountCents;
  if (nextBalanceCents < 0) throw new Error(STORE_CREDIT_INSUFFICIENT);
  return {
    type: 'ADJUST',
    adjustSign: input.adjustSign,
    amountCents: input.amountCents,
    nextBalanceCents,
  };
}

export function assertNcCanIssueStoreCredit(input: {
  readonly consentStoreCredit: boolean;
  readonly arCompensate: boolean;
  readonly cashRefund: boolean;
}): void {
  if (!input.consentStoreCredit || input.arCompensate || input.cashRefund) {
    throw new Error(STORE_CREDIT_NC_NOT_ELIGIBLE);
  }
}
