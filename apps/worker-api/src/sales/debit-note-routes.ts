/**
 * Backlog v10 P1a — Nota de Débito `08` (Arquitectura §5.1 regla 5,
 * ADR-FISCAL-003, FIS-13).
 *
 * - POST /api/sales/debit-notes: emite una ND sobre un comprobante ACEPTADO
 *   (factura/boleta) con motivo del catálogo 10; correlativo server-side,
 *   audit DEBIT_NOTE, 0 impacto en stock. La ND de factura sale por el
 *   pipeline unitario; la de boleta por el RC (§5.2).
 *
 * Gating: flag default-off → 404. El tenant viene del JWT.
 */
import { processDebitNoteAtomic } from '@kipuspay/adapters-d1';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

export interface DebitNoteEnv {
  readonly FEATURE_SALES_DEBIT_NOTE?: string;
  readonly DB?: unknown;
}

export function isDebitNoteEnabled(env: DebitNoteEnv | undefined): boolean {
  return env?.FEATURE_SALES_DEBIT_NOTE === '1';
}

export async function runDebitNoteHttp(
  env: DebitNoteEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isDebitNoteEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'DEBIT_NOTE_DB_UNAVAILABLE' } };
  const originSaleId = typeof body.originSaleId === 'string' ? body.originSaleId.trim() : '';
  const series = typeof body.series === 'string' ? body.series.trim() : '';
  const motiveCode = typeof body.motiveCode === 'string' ? body.motiveCode.trim() : '';
  const amountCents = body.amountCents;
  const description =
    typeof body.description === 'string' && body.description.trim().length > 0
      ? body.description.trim()
      : undefined;
  if (!originSaleId || !series || !motiveCode || typeof amountCents !== 'number') {
    return {
      status: 400,
      body: {
        code: 'BAD_REQUEST',
        error: 'originSaleId, series, motiveCode and amountCents required',
      },
    };
  }
  try {
    const request: { motiveCode: string; amountCents: number; description?: string } = {
      motiveCode,
      amountCents,
    };
    if (description !== undefined) request.description = description;
    const result = await processDebitNoteAtomic(
      env.DB as never,
      actor.tenantId,
      actor.userId,
      originSaleId,
      request,
      series,
      { ledgerArApEnabled: true },
    );
    return { status: 201, body: { ...result } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { code: msg, error: msg } };
  }
}
