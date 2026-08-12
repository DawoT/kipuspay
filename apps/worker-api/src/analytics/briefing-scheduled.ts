/**
 * Sprint 49 — Morning Briefing (Arquitectura §5.3 regla 33, cron 3:30 AM).
 * Genera 3 viñetas deterministas para el día cerrado y las cachea en KV
 * `insights:{tenant}:{fecha}` (lectura UI <10ms). Consume 1 query del cupo
 * diario de ai_usage_counters. Edge D: la re-materialización del rollup borra
 * la key (rollup-rematerialize.ts) y el briefing se regenera.
 */
import { consumeAiUsage, listBriefingFacts, type D1DatabaseLike } from '@kipuspay/adapters-d1';
import { buildBriefing } from '@kipuspay/domain-analytics';
import type { InsightsKv } from '@kipuspay/adapters-d1';

export interface BriefingScheduledInput {
  readonly scheduledTime?: number;
}

export interface BriefingScheduledResult {
  readonly status: 'COMPLETE' | 'FEATURE_OFF' | 'DB_UNAVAILABLE';
  readonly tenants: number;
  readonly written: number;
  readonly failures: number;
}

export interface BriefingEnv {
  readonly FEATURE_ANALYTICS_AGENTIC_INSIGHTS?: string;
  readonly DB?: D1DatabaseLike;
  readonly TENANT_KV?: InsightsKv;
}

export function isBriefingEnabled(env: BriefingEnv | undefined): boolean {
  return env?.FEATURE_ANALYTICS_AGENTIC_INSIGHTS === '1';
}

/** WorkerEnv real es compatible estructuralmente; el probe evita exactOptional. */
export type BriefingEnvProbe = BriefingEnv;

export async function runBriefingScheduled(
  env: BriefingEnv,
  input: BriefingScheduledInput = {},
): Promise<BriefingScheduledResult> {
  if (!isBriefingEnabled(env))
    return { status: 'FEATURE_OFF', tenants: 0, written: 0, failures: 0 };
  if (!env.DB || !env.TENANT_KV) {
    return { status: 'DB_UNAVAILABLE', tenants: 0, written: 0, failures: 0 };
  }
  const nowMs = input.scheduledTime ?? Date.now();
  // Día cerrado en Lima: ayer (el rollup de ayer se generó a las 8 AM).
  const reportDate = new Date(nowMs - 5 * 3600 * 1000 - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const tenants = await env.DB.prepare(
    `SELECT DISTINCT tenant_id FROM daily_financial_rollups WHERE report_date = ?`,
  )
    .bind(reportDate)
    .all<{ tenant_id: string }>();

  let written = 0;
  let failures = 0;
  for (const row of tenants.results ?? []) {
    const tenantId = row.tenant_id;
    try {
      const facts = await listBriefingFacts(env.DB, tenantId, reportDate);
      const briefing = buildBriefing({
        tenantId,
        reportDate,
        sales: facts.sales,
        breakage: facts.breakage.map((entry) => ({
          productName: entry.productName,
          daysCovered: 0,
          suggestedReorderQty: 0,
        })),
        cashExceptions: facts.cashExceptions,
      });
      await env.TENANT_KV.put(`insights:${tenantId}:${reportDate}`, JSON.stringify(briefing));
      await consumeAiUsage(env.DB, tenantId, reportDate, 0, estimateTokens(briefing));
      written += 1;
    } catch {
      failures += 1;
    }
  }
  return { status: 'COMPLETE', tenants: tenants.results?.length ?? 0, written, failures };
}

function estimateTokens(briefing: { readonly bullets: readonly string[] }): number {
  return Math.ceil(briefing.bullets.join(' ').length / 4);
}
