/**
 * Backlog v10 P1a — cliente de la Nota de Débito `08` (ADR-FISCAL-003).
 * El servidor es la única autoridad del correlativo y del guard fiscal.
 */
import { resolveApiAuth, resolveApiBase, applyApiAuthHeaders } from '../auth/api-client.js';

export interface DebitNoteInput {
  readonly originSaleId: string;
  readonly series: string;
  readonly motiveCode: string;
  readonly amountCents: number;
  readonly description?: string;
}

export interface DebitNoteIssued {
  readonly ok: true;
  readonly debitNoteId: string;
  readonly series: string;
  readonly number: number;
  readonly amountCents: number;
  readonly motiveCode: string;
  readonly mustSubmitByIso: string;
}

interface DebitNoteResponse {
  code?: string;
  error?: string;
  debitNoteId?: string;
  series?: string;
  number?: number;
  amountCents?: number;
  motiveCode?: string;
  mustSubmitByIso?: string;
}

function validationError(input: DebitNoteInput): string | null {
  if (!input.originSaleId.trim() || !input.series.trim() || !input.motiveCode.trim()) {
    return 'Comprobante, serie y motivo son requeridos.';
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return 'El monto debe ser un entero positivo en centavos.';
  }
  return null;
}

function toIssued(data: DebitNoteResponse): DebitNoteIssued {
  return {
    ok: true,
    debitNoteId: String(data.debitNoteId ?? ''),
    series: String(data.series ?? ''),
    number: Number(data.number ?? 0),
    amountCents: Number(data.amountCents ?? 0),
    motiveCode: String(data.motiveCode ?? ''),
    mustSubmitByIso: String(data.mustSubmitByIso ?? ''),
  };
}

export async function issueDebitNote(
  input: DebitNoteInput,
): Promise<DebitNoteIssued | { ok: false; message: string }> {
  const apiBase = resolveApiBase();
  const auth = resolveApiAuth().authorization ?? '';
  const invalid = validationError(input);
  if (invalid !== null) {
    return { ok: false, message: invalid };
  }
  try {
    const headers = new Headers({
      'content-type': 'application/json',
      authorization: auth,
    });
    applyApiAuthHeaders(headers);
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/sales/debit-notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        originSaleId: input.originSaleId,
        series: input.series,
        motiveCode: input.motiveCode,
        amountCents: input.amountCents,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      }),
    });
    const data = (await res.json()) as DebitNoteResponse;
    if (!res.ok)
      return {
        ok: false,
        message: data.error ?? data.code ?? 'No se pudo emitir la nota de débito.',
      };
    return toIssued(data);
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}
