/**
 * Backlog v10 P1c — Percepciones `02` / Retenciones `20` (Arquitectura §5.2c,
 * ADR-FISCAL-005). Montos en cents calculados server-side; audit
 * PERCEPTION/RETENTION. Gating: FEATURE_FISCAL_WITHHOLDINGS default-off.
 */
import { processPerceptionAtomic, processRetentionAtomic } from '@kipuspay/adapters-d1';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export interface WithholdingEnv {
  readonly FEATURE_FISCAL_WITHHOLDINGS?: string;
  readonly DB?: unknown;
}

export function isWithholdingsEnabled(env: WithholdingEnv | undefined): boolean {
  return env?.FEATURE_FISCAL_WITHHOLDINGS === '1';
}

async function requireWithholdings(
  env: WithholdingEnv,
  tenantId: string,
): Promise<HttpResult | null> {
  try {
    await new CapabilityResolver(env as never).require(tenantId, 'fiscal.withholdings');
    return null;
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status,
        body: { code: error.status === 404 ? 'FEATURE_OFF' : error.code },
      };
    }
    return { status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } };
  }
}

export async function runPerceptionHttp(
  env: WithholdingEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!env.DB) return { status: 503, body: { code: 'WITHHOLDINGS_DB_UNAVAILABLE' } };
  const capabilityError = await requireWithholdings(env, actor.tenantId);
  if (capabilityError) return capabilityError;
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
  if (!env.DB) return { status: 503, body: { code: 'WITHHOLDINGS_DB_UNAVAILABLE' } };
  const capabilityError = await requireWithholdings(env, actor.tenantId);
  if (capabilityError) return capabilityError;
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
