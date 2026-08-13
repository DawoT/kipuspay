/**
 * Backlog v10 P1c — cliente de percepciones `02` / retenciones `20`
 * (ADR-FISCAL-005). Los montos se calculan siempre server-side.
 */

export interface PerceptionInput {
  readonly branchId: string;
  readonly originSaleId: string;
  readonly series: string;
  readonly category: string;
  readonly baseAmountCents: number;
}

export interface RetentionInput {
  readonly branchId: string;
  readonly originSupplierInvoiceId: string;
  readonly series: string;
  readonly category: string;
  readonly baseAmountCents: number;
}

export interface WithholdingIssued {
  readonly ok: true;
  readonly series: string;
  readonly number: number;
  readonly baseAmountCents: number;
  readonly amountCents: number;
  readonly ratePercentage: number;
  readonly sunatStatus: string;
}

async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<WithholdingIssued | { ok: false; message: string }> {
  const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
  const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      series?: string;
      number?: number;
      baseAmountCents?: number;
      amountCents?: number;
      ratePercentage?: number;
      sunatStatus?: string;
    };
    if (!res.ok) return { ok: false, message: data.error ?? data.code ?? 'Operación rechazada.' };
    return {
      ok: true,
      series: String(data.series ?? ''),
      number: Number(data.number ?? 0),
      baseAmountCents: Number(data.baseAmountCents ?? 0),
      amountCents: Number(data.amountCents ?? 0),
      ratePercentage: Number(data.ratePercentage ?? 0),
      sunatStatus: String(data.sunatStatus ?? ''),
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}

export function issuePerception(
  input: PerceptionInput,
): Promise<WithholdingIssued | { ok: false; message: string }> {
  if (!input.originSaleId.trim() || !input.series.trim() || !input.category.trim()) {
    return Promise.resolve({ ok: false, message: 'Venta, serie y categoría son requeridos.' });
  }
  return post('/api/fiscal/perceptions', { ...input });
}

export function issueRetention(
  input: RetentionInput,
): Promise<WithholdingIssued | { ok: false; message: string }> {
  if (!input.originSupplierInvoiceId.trim() || !input.series.trim() || !input.category.trim()) {
    return Promise.resolve({ ok: false, message: 'Factura, serie y categoría son requeridos.' });
  }
  return post('/api/fiscal/retentions', { ...input });
}
