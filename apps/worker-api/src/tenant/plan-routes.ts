/**
 * S11-B5 — cambio de plan self-serve (GTM §8 "Cambias de plan en un clic").
 * Solo owner/admin; plan_id validado contra el CHECK del DDL; el cupo del
 * plan lo aplica domain-billing (planQuotaForPlanId) en el meter.
 * Ola 4: invoca domain-billing.provisionCapabilitiesForPlan → batch atómico
 * con tenants plan_id + tenant_capabilities (INSERT OR IGNORE plan_default +
 * DELETE plan_default huérfano) + audit_events PLAN_UPGRADE + tenant_data_epochs.
 * Preserva overrides platform_override (config_json distinto) tanto en upgrade
 * como en downgrade; documentado en plan-reconcile.ts.
 */
import { isSelfServePlan, provisionCapabilitiesForPlan } from '@kipuspay/domain-billing';
import type { WorkerEnv } from '../auth/control-plane.js';
import { persistStripeCustomerBestEffort } from './stripe-billing.js';
import { reconcilePlanAtomic } from './plan-reconcile.js';

const ALLOWED_SELF_SERVE = new Set(['arranque', 'crece', 'cadena']);

// eslint-disable-next-line complexity
export async function runUpdatePlanHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string,
  body: unknown,
  opts?: { actorUserId?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env?.DB)
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const normalizedRole = role.toLowerCase();
  if (normalizedRole !== 'owner' && normalizedRole !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const planIdRaw = (body as Record<string, unknown>).planId;
  const planId = typeof planIdRaw === 'string' ? planIdRaw.trim() : '';
  if (planId === 'enterprise') {
    return {
      status: 422,
      body: {
        error: 'Enterprise se contrata con el equipo comercial',
        code: 'ENTERPRISE_SALES_ASSISTED',
      },
    };
  }
  if (!ALLOWED_SELF_SERVE.has(planId) || !isSelfServePlan(planId)) {
    return { status: 422, body: { error: 'Invalid planId', code: 'INVALID_PLAN' } };
  }
  // Validar que domain-billing reconoce el plan (lanza si no)
  try {
    provisionCapabilitiesForPlan(planId);
  } catch {
    return { status: 422, body: { error: 'Invalid planId', code: 'INVALID_PLAN' } };
  }
  try {
    const row = await env.DB.prepare(
      'SELECT id, trade_name, plan_id FROM tenants WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(tenantId)
      .first<{ id: string; trade_name?: string | null; plan_id?: string | null }>();
    if (!row) return { status: 404, body: { error: 'Not found', code: 'TENANT_NOT_FOUND' } };
    const prevPlanId = row.plan_id ?? 'arranque';
    if (prevPlanId === planId) {
      // Idempotente: mismo plan no duplica audit (misión Ola 4)
      return { status: 200, body: { planId } };
    }
    const actorUserId = opts?.actorUserId ?? tenantId;
    const result = await reconcilePlanAtomic(env, tenantId, planId, {
      actorUserId,
      source: 'api',
      prevPlanId,
    });
    if (result.status === 'error') {
      return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
    }
    if (result.status === 'not_found') {
      return { status: 404, body: { error: 'Not found', code: 'TENANT_NOT_FOUND' } };
    }
    await persistStripeCustomerBestEffort(env, tenantId, row.trade_name ?? tenantId);
    return { status: 200, body: { planId } };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}
