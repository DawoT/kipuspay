/**
 * Cotizaciones — Arquitectura §5.3 regla 18 / ADR-0017 / COM-05.
 * Puro, sin D1. Microunidades + cents. 0 CPE y 0 reserva hasta convertir.
 */

import { roundCentsFromMicrounitsCents } from '@kipuspay/domain-inventory';

export const QUOTE_ITEMS_REQUIRED = 'QUOTE_ITEMS_REQUIRED';
export const QUOTE_INVALID_AMOUNT = 'QUOTE_INVALID_AMOUNT';
export const QUOTE_INVALID_STATUS = 'QUOTE_INVALID_STATUS';
export const QUOTE_EXPIRED = 'QUOTE_EXPIRED';
export const QUOTE_ALREADY_CONVERTED = 'QUOTE_ALREADY_CONVERTED';
export const QUOTE_ALREADY_TERMINAL = 'QUOTE_ALREADY_TERMINAL';
export const QUOTE_NOT_APPROVED = 'QUOTE_NOT_APPROVED';
export const QUOTE_MISSING_VALID_UNTIL = 'QUOTE_MISSING_VALID_UNTIL';
export const QUOTE_VALID_UNTIL_TOO_FAR = 'QUOTE_VALID_UNTIL_TOO_FAR';
/** S33-H3: tope server de vigencia de una cotización (90 días). */
export const QUOTE_MAX_VALID_DAYS = 90;

export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';

export interface QuoteItemInput {
  readonly productId: string;
  readonly baseQuantityMicrounits: number;
  readonly unitPriceCents: number;
}

export interface QuoteCreatePlan {
  readonly status: 'DRAFT';
  readonly snapshotTotalCents: number;
  readonly validUntilIso: string | null;
  readonly emitsFiscalDocument: false;
  readonly reservesStock: false;
  readonly items: readonly QuoteItemInput[];
}

export function planQuoteCreate(input: {
  readonly items: readonly QuoteItemInput[];
  readonly validUntilIso: string | null;
  readonly nowIso: string;
}): QuoteCreatePlan {
  if (input.items.length === 0) throw new Error(QUOTE_ITEMS_REQUIRED);
  // S33-H3: la cotización SIEMPRE vence (0 cotización perpetua con precio
  // congelado) y el tope es server-side: 1..QUOTE_MAX_VALID_DAYS días.
  if (!input.validUntilIso) throw new Error(QUOTE_MISSING_VALID_UNTIL);
  const validUntilDay = input.validUntilIso.slice(0, 10);
  const nowDay = input.nowIso.slice(0, 10);
  const dayDiff = Math.round(
    (Date.parse(`${validUntilDay}T00:00:00Z`) - Date.parse(`${nowDay}T00:00:00Z`)) / 86_400_000,
  );
  if (dayDiff < 1) throw new Error(QUOTE_EXPIRED);
  if (dayDiff > QUOTE_MAX_VALID_DAYS) throw new Error(QUOTE_VALID_UNTIL_TOO_FAR);
  let snapshotTotalCents = 0;
  for (const item of input.items) {
    if (!item.productId.trim()) throw new Error(QUOTE_ITEMS_REQUIRED);
    snapshotTotalCents += lineCents(item);
  }
  return {
    status: 'DRAFT',
    snapshotTotalCents,
    validUntilIso: input.validUntilIso,
    emitsFiscalDocument: false,
    reservesStock: false,
    items: input.items,
  };
}

export function assertQuoteSendable(input: { readonly status: QuoteStatus }): void {
  if (input.status === 'EXPIRED') throw new Error(QUOTE_EXPIRED);
  if (input.status !== 'DRAFT') throw new Error(QUOTE_INVALID_STATUS);
}

export function assertQuoteApprovable(input: { readonly status: QuoteStatus }): void {
  if (input.status === 'EXPIRED') throw new Error(QUOTE_EXPIRED);
  if (input.status !== 'DRAFT' && input.status !== 'SENT') {
    throw new Error(QUOTE_INVALID_STATUS);
  }
}

export function assertQuoteCancelAllowed(input: { readonly status: QuoteStatus }): void {
  if (input.status === 'CONVERTED' || input.status === 'CANCELLED' || input.status === 'EXPIRED') {
    throw new Error(QUOTE_ALREADY_TERMINAL);
  }
}

export function assertQuoteConvertible(input: {
  readonly status: QuoteStatus;
  readonly validUntilIso: string | null;
  readonly nowIso: string;
}): void {
  if (input.status === 'CONVERTED') throw new Error(QUOTE_ALREADY_CONVERTED);
  if (input.status === 'EXPIRED') throw new Error(QUOTE_EXPIRED);
  if (input.status === 'CANCELLED') throw new Error(QUOTE_INVALID_STATUS);
  if (input.status !== 'APPROVED') throw new Error(QUOTE_NOT_APPROVED);
  if (isPastValidUntil(input.validUntilIso, input.nowIso)) throw new Error(QUOTE_EXPIRED);
}

export function markQuoteExpired(input: {
  readonly status: QuoteStatus;
  readonly validUntilIso: string | null;
  readonly nowIso: string;
}): QuoteStatus {
  if (input.status !== 'DRAFT' && input.status !== 'SENT' && input.status !== 'APPROVED') {
    return input.status;
  }
  return isPastValidUntil(input.validUntilIso, input.nowIso) ? 'EXPIRED' : input.status;
}

function isPastValidUntil(validUntilIso: string | null, nowIso: string): boolean {
  if (!validUntilIso) return false;
  return nowIso.slice(0, 10) > validUntilIso.slice(0, 10);
}

function lineCents(item: QuoteItemInput): number {
  if (!Number.isInteger(item.baseQuantityMicrounits) || item.baseQuantityMicrounits <= 0) {
    throw new Error(QUOTE_INVALID_AMOUNT);
  }
  if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
    throw new Error(QUOTE_INVALID_AMOUNT);
  }
  try {
    return roundCentsFromMicrounitsCents({
      quantityMicrounits: item.baseQuantityMicrounits,
      unitPriceCents: item.unitPriceCents,
    });
  } catch {
    throw new Error(QUOTE_INVALID_AMOUNT);
  }
}
