/**
 * Backlog v10 P1a — cliente de la Nota de Débito `08` (ADR-FISCAL-003).
 * El servidor es la única autoridad del correlativo y del guard fiscal.
 */

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

export async function issueDebitNote(
  input: DebitNoteInput,
): Promise<DebitNoteIssued | { ok: false; message: string }> {
  const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
  const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  if (!input.originSaleId.trim() || !input.series.trim() || !input.motiveCode.trim()) {
    return { ok: false, message: 'Comprobante, serie y motivo son requeridos.' };
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, message: 'El monto debe ser un entero positivo en centavos.' };
  }
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/sales/debit-notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth },
      body: JSON.stringify({
        originSaleId: input.originSaleId,
        series: input.series,
        motiveCode: input.motiveCode,
        amountCents: input.amountCents,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      }),
    });
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      debitNoteId?: string;
      series?: string;
      number?: number;
      amountCents?: number;
      motiveCode?: string;
      mustSubmitByIso?: string;
    };
    if (!res.ok)
      return {
        ok: false,
        message: data.error ?? data.code ?? 'No se pudo emitir la nota de débito.',
      };
    return {
      ok: true,
      debitNoteId: String(data.debitNoteId ?? ''),
      series: String(data.series ?? ''),
      number: Number(data.number ?? 0),
      amountCents: Number(data.amountCents ?? 0),
      motiveCode: String(data.motiveCode ?? ''),
      mustSubmitByIso: String(data.mustSubmitByIso ?? ''),
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}
