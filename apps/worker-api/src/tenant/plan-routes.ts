/**
 * S11-B5 — cambio de plan self-serve (GTM §8 "Cambias de plan en un clic").
 * Solo owner/admin; plan_id validado contra el CHECK del DDL; el cupo del
 * plan lo aplica domain-billing (planQuotaForPlanId) en el meter.
 */
import type { WorkerEnv } from '../auth/control-plane.js';
import { persistStripeCustomerBestEffort } from './stripe-billing.js';

const ALLOWED_PLANS = new Set(['arranque', 'crece', 'cadena']);

export async function runUpdatePlanHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env?.DB) return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const normalizedRole = role.toLowerCase();
  if (normalizedRole !== 'owner' && normalizedRole !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const planId = String((body as Record<string, unknown>).planId ?? '').trim();
  if (planId === 'enterprise') {
    return {
      status: 422,
      body: {
        error: 'Enterprise se contrata con el equipo comercial',
        code: 'ENTERPRISE_SALES_ASSISTED',
      },
    };
  }
  if (!ALLOWED_PLANS.has(planId)) {
    return { status: 422, body: { error: 'Invalid planId', code: 'INVALID_PLAN' } };
  }
  try {
    const row = await env.DB.prepare(
      'SELECT id, trade_name FROM tenants WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(tenantId)
      .first<{ id: string; trade_name?: string | null }>();
    if (!row) return { status: 404, body: { error: 'Not found', code: 'TENANT_NOT_FOUND' } };
    await env.DB.prepare('UPDATE tenants SET plan_id = ? WHERE id = ?')
      .bind(planId, tenantId)
      .run();
    await persistStripeCustomerBestEffort(env, tenantId, row.trade_name ?? tenantId);
    return { status: 200, body: { planId } };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}
