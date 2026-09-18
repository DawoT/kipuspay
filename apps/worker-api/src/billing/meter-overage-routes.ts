/**
 * Cron metering sobregiro — Sprint 27 (§4.1). Fuera del hot path de cobro.
 */
import { runMeterOverageCron } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export function isBillingUsageOverageEnabled(env: WorkerEnv | undefined): boolean {
  return (
    env?.FEATURE_BILLING_USAGE_OVERAGE === '1' || env?.FEATURE_BILLING_USAGE_OVERAGE === 'true'
  );
}

/** S27-H2: el cron cobra sobregiros en Stripe — solo admin/owner. */
function isAdminRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export async function runMeterOverageCronHttp(
  env: WorkerEnv,
  opts?: { nowMs?: number },
  userRole?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!userRole || !isAdminRole(userRole)) {
    return { status: 403, body: { error: 'admin role required', code: 'FORBIDDEN_ADMIN' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const rows = await env.DB.prepare(
    `SELECT DISTINCT tenant_id FROM tenant_capabilities
       WHERE capability = 'billing.usage_overage' AND enabled = 1 LIMIT 5000`,
  )
    .bind()
    .all<{ tenant_id: string }>();
  const allowedTenantIds = new Set<string>();
  for (const row of rows.results ?? []) {
    try {
      await new CapabilityResolver(env).require(row.tenant_id, 'billing.usage_overage');
      allowedTenantIds.add(row.tenant_id);
    } catch (error) {
      if (error instanceof CapabilityError && error.status !== 404) {
        return {
          status: 503,
          body: { error: 'Capabilities unavailable', code: 'CAPABILITIES_UNAVAILABLE' },
        };
      }
      // Revoked tenants are not charged.
    }
  }
  const result = await runMeterOverageCron({
    db: env.DB,
    stripeApiKey: env.STRIPE_SECRET_KEY,
    allowedTenantIds,
    ...(opts?.nowMs !== undefined ? { nowMs: opts.nowMs } : {}),
  });
  return {
    status: result.errors.length > 0 && result.reported === 0 ? 502 : 200,
    body: { ...result },
  };
}
