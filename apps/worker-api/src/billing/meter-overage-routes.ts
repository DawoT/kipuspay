/**
 * Cron metering sobregiro — Sprint 27 (§4.1). Fuera del hot path de cobro.
 */
import { runMeterOverageCron } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isBillingUsageOverageEnabled(env: WorkerEnv | undefined): boolean {
  return (
    env?.FEATURE_BILLING_USAGE_OVERAGE === '1' || env?.FEATURE_BILLING_USAGE_OVERAGE === 'true'
  );
}

export async function runMeterOverageCronHttp(
  env: WorkerEnv,
  opts?: { nowMs?: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isBillingUsageOverageEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_OFF', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const result = await runMeterOverageCron({
    db: env.DB,
    stripeApiKey: env.STRIPE_SECRET_KEY,
    ...(opts?.nowMs !== undefined ? { nowMs: opts.nowMs } : {}),
  });
  return {
    status: result.errors.length > 0 && result.reported === 0 ? 502 : 200,
    body: { ...result },
  };
}
