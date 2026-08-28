/**
 * Taller premium — cotización → factura en 1 toque.
 * Pure, zero-dep, offline-first. Dinero solo cents enteros.
 * Copy sin jerga técnica (V-27) y gates por capability (isSalesQuotesEnabled).
 */
import { normalizePlate } from './quote-history.js';

export type QuoteStatus = string;

const ALLOWED_STATUSES = new Set(['APPROVED', 'SENT', 'PENDING', 'CREATED', 'DRAFT']);

export function isOneTapAllowed(isQuotesEnabled: boolean, status: QuoteStatus): boolean {
  if (!isQuotesEnabled) return false;
  if (typeof status !== 'string') return false;
  const s = status.trim().toUpperCase();
  return ALLOWED_STATUSES.has(s);
}

export interface OneTapValidationOk {
  readonly ok: true;
}
export interface OneTapValidationFail {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}
export type OneTapValidation = OneTapValidationOk | OneTapValidationFail;

function humanForCode(code: string): string {
  if (code === 'QUOTE_ID_REQUIRED') return 'Falta el código de cotización.';
  if (code === 'QUOTE_EXPIRED') return 'La cotización venció. Crea una nueva para cobrar.';
  if (code === 'INVALID_TOTAL') return 'El total no es válido. Revisa el monto.';
  if (code === 'INVALID_DATE') return 'La fecha de vigencia no es válida.';
  return 'No se pudo completar. Verifica los datos e intenta de nuevo.';
}

export function validateOneTapRequest(input: {
  readonly quoteId: string;
  readonly validUntilIso?: string;
  readonly totalCents?: number;
}): OneTapValidation {
  const qid = typeof input.quoteId === 'string' ? input.quoteId.trim() : '';
  if (!qid)
    return { ok: false, code: 'QUOTE_ID_REQUIRED', message: humanForCode('QUOTE_ID_REQUIRED') };

  if (input.totalCents !== undefined) {
    const v = input.totalCents;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      return { ok: false, code: 'INVALID_TOTAL', message: humanForCode('INVALID_TOTAL') };
    }
  }

  if (
    input.validUntilIso !== undefined &&
    input.validUntilIso !== null &&
    String(input.validUntilIso).trim() !== ''
  ) {
    const raw = String(input.validUntilIso).trim();
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) {
      return { ok: false, code: 'INVALID_DATE', message: humanForCode('INVALID_DATE') };
    }
    // Compare at day level: validUntil is inclusive end of day Lima
    const valid = new Date(ms);
    const now = new Date();
    // Normalize to midnight UTC for comparison — if valid date is before today, expired
    const validDay = Date.UTC(valid.getUTCFullYear(), valid.getUTCMonth(), valid.getUTCDate());
    const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    // Also handle YYYY-MM-DD without time: treat as <= nowDay-1 = expired
    if (validDay < nowDay) {
      return { ok: false, code: 'QUOTE_EXPIRED', message: humanForCode('QUOTE_EXPIRED') };
    }
  }

  return { ok: true };
}

export interface OneTapPayload {
  readonly quoteId: string;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly series: string;
  readonly documentType: string;
  readonly plate?: string;
  readonly customerName?: string;
  readonly totalCents?: number;
}

export function buildOneTapConvertPayload(input: {
  readonly quoteId: string;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly series: string;
  readonly documentType: string;
  readonly plate?: string;
  readonly customerName?: string;
  readonly totalCents?: number;
}): OneTapPayload {
  const base: OneTapPayload = {
    quoteId: String(input.quoteId).trim(),
    branchId: String(input.branchId).trim(),
    cashRegisterSessionId: String(input.cashRegisterSessionId).trim(),
    series: String(input.series).trim(),
    documentType: String(input.documentType).trim(),
  };
  const out: Record<string, unknown> = { ...base };
  if (typeof input.plate === 'string' && input.plate.trim()) {
    const norm = normalizePlate(input.plate);
    if (norm) out.plate = norm;
  }
  if (typeof input.customerName === 'string' && input.customerName.trim()) {
    out.customerName = input.customerName.trim();
  }
  if (
    typeof input.totalCents === 'number' &&
    Number.isSafeInteger(input.totalCents) &&
    input.totalCents >= 0
  ) {
    out.totalCents = input.totalCents;
  }
  return out as unknown as OneTapPayload;
}

export function humanQuoteError(code: string): string {
  const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (c === 'QUOTE_EXPIRED') return 'La cotización venció. Crea una nueva para cobrar.';
  if (c === 'QUOTE_NOT_FOUND') return 'No encontramos esa cotización. Verifica el código.';
  if (c === 'QUOTE_ID_REQUIRED') return 'Falta el código de cotización.';
  if (c === 'INVALID_TOTAL' || c === 'INVALID_TOTAL_CENTS')
    return 'El total no es válido. Revisa el monto.';
  if (c === 'EXPIRED' || c === 'VALID_UNTIL_EXPIRED')
    return 'La cotización venció. Crea una nueva para cobrar.';
  if (c === 'NOT_FOUND') return 'No encontramos esa cotización. Verifica el código.';
  if (c === 'FORBIDDEN' || c === 'UNAUTHORIZED')
    return 'No tienes permiso para cobrar esta cotización.';
  return 'No se pudo completar. Verifica los datos e intenta de nuevo.';
}

export function mapQuoteErrorToMessage(code: string): string {
  return humanQuoteError(code);
}
