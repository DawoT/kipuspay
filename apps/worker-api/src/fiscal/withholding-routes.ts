/**
 * Backlog v10 P1c — Percepciones `02` / Retenciones `20` (Arquitectura §5.2c,
 * ADR-FISCAL-005). Montos en cents calculados server-side; audit
 * PERCEPTION/RETENTION. Gating: FEATURE_FISCAL_WITHHOLDINGS default-off.
 */
import { processPerceptionAtomic, processRetentionAtomic } from '@kipuspay/adapters-d1';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

export interface WithholdingEnv {
  readonly FEATURE_FISCAL_WITHHOLDINGS?: string;
  readonly DB?: unknown;
}

export function isWithholdingsEnabled(env: WithholdingEnv | undefined): boolean {
  return env?.FEATURE_FISCAL_WITHHOLDINGS === '1';
}

export async function runPerceptionHttp(
  env: WithholdingEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isWithholdingsEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'WITHHOLDINGS_DB_UNAVAILABLE' } };
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const originSaleId = typeof body.originSaleId === 'string' ? body.originSaleId : '';
  const series = typeof body.series === 'string' ? body.series : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const baseAmountCents = body.baseAmountCents;
  if (!branchId || !originSaleId || !series || !category || typeof baseAmountCents !== 'number') {
    return {
      status: 400,
      body: {
        code: 'BAD_REQUEST',
        error: 'branchId, originSaleId, series, category and baseAmountCents required',
      },
    };
  }
  try {
    const result = await processPerceptionAtomic(
      env.DB as never,
      actor.tenantId,
      branchId,
      actor.userId,
      originSaleId,
      series,
      baseAmountCents,
      category,
    );
    return { status: 201, body: { ...result } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { code: msg, error: msg } };
  }
}

export async function runRetentionHttp(
  env: WithholdingEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isWithholdingsEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'WITHHOLDINGS_DB_UNAVAILABLE' } };
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const originSupplierInvoiceId =
    typeof body.originSupplierInvoiceId === 'string' ? body.originSupplierInvoiceId : '';
  const series = typeof body.series === 'string' ? body.series : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const baseAmountCents = body.baseAmountCents;
  if (
    !branchId ||
    !originSupplierInvoiceId ||
    !series ||
    !category ||
    typeof baseAmountCents !== 'number'
  ) {
    return {
      status: 400,
      body: {
        code: 'BAD_REQUEST',
        error: 'branchId, originSupplierInvoiceId, series, category and baseAmountCents required',
      },
    };
  }
  try {
    const result = await processRetentionAtomic(
      env.DB as never,
      actor.tenantId,
      branchId,
      actor.userId,
      originSupplierInvoiceId,
      series,
      baseAmountCents,
      category,
    );
    return { status: 201, body: { ...result } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { code: msg, error: msg } };
  }
}
