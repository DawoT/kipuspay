/**
 * Nota de Débito `08` — Backlog v10 P1a (Arquitectura §5.1 regla 5, §5.2,
 * ADR-FISCAL-003).
 *
 * La ND incrementa el valor de un comprobante ACEPTADO (factura `01` o boleta
 * `03`) por motivos del catálogo 10 (cerrado). No toca stock: solo ajusta
 * impuestos y saldos. Se anula con una NC de la ND, nunca con DELETE
 * (append-only, FIS-08). Puro: sin D1, sin deps de red.
 */

export type OriginSunatStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'QUARANTINED'
  | 'DEADLINE_EXCEEDED'
  | 'NOT_APPLICABLE';

/** Motivos del catálogo 10 (cerrado; FIS-13 / ADR-FISCAL-003). */
export const DEBIT_NOTE_MOTIVE_CODES = ['01', '02', '03', '10'] as const;

export type DebitNoteMotiveCode = (typeof DEBIT_NOTE_MOTIVE_CODES)[number];

export interface DebitNoteOrigin {
  readonly saleId: string;
  readonly documentType: string;
  readonly sunatStatus: OriginSunatStatus;
  readonly totalAmountCents: number;
}

export interface DebitNoteRequest {
  readonly motiveCode: string;
  readonly amountCents: number;
  readonly description?: string;
}

export type DebitNoteGuardResult =
  | { readonly ok: true; readonly requiresNoCdrAudit: boolean }
  | { readonly ok: false; readonly code: string };

/**
 * Guard de emisión: la ND exige un comprobante ACEPTADO de tipo factura o
 * boleta. Sobre orígenes sin CDR (REJECTED/QUARANTINED/DEADLINE) la vía es la
 * NC de anulación E-A/E-B (§8), nunca una ND. `amountCents > 0` siempre.
 */
export function assertDebitNoteAllowed(
  origin: DebitNoteOrigin,
  request: DebitNoteRequest,
): DebitNoteGuardResult {
  if (origin.documentType !== '01' && origin.documentType !== '03') {
    return { ok: false, code: 'DEBIT_NOTE_ORIGIN_UNSUPPORTED' };
  }
  if (origin.sunatStatus !== 'ACCEPTED') {
    return { ok: false, code: 'FISCAL_CDR_REQUIRED' };
  }
  if (!DEBIT_NOTE_MOTIVE_CODES.includes(request.motiveCode as DebitNoteMotiveCode)) {
    return { ok: false, code: 'INVALID_DEBIT_NOTE_MOTIVE' };
  }
  if (!Number.isInteger(request.amountCents) || request.amountCents <= 0) {
    return { ok: false, code: 'INVALID_DEBIT_NOTE_AMOUNT' };
  }
  if (request.description !== undefined && request.description.trim().length === 0) {
    return { ok: false, code: 'INVALID_DEBIT_NOTE_DESCRIPTION' };
  }
  return { ok: true, requiresNoCdrAudit: false };
}

/**
 * La ND solo ajusta montos: jamás devuelve ni consume stock (a diferencia de
 * la NC). Cero ítems de producto en el documento.
 */
export function debitNoteStockImpact(): number {
  return 0;
}
