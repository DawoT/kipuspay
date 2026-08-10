/**
 * Cron diario de forecasting (Sprint 46 / ADR-0030, Arquitectura §5.3 regla 31).
 *
 * Corre después del rollup diario (`0 8 * * *`) para consumir daily_product_rollups
 * frescos. D1 es la única calculadora: delega a @kipuspay/adapters-d1/forecast-repository
 * (que a su vez usa el dominio puro). Feature flag FEATURE_ANALYTICS_FORECASTING,
 * default off. Idempotente: re-ejecutar el mismo día escribe los mismos forecast_outputs.
 */
import {
  FORECAST_HISTORY_DAYS,
  historyWindowStart,
  listForecastCandidates,
  writeForecastForCandidate,
} from '@kipuspay/adapters-d1/forecast-repository';
import type { D1DatabaseLike } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isAnalyticsForecastingEnabled } from '../auth/features.js';

export interface ForecastScheduledInput {
  readonly scheduledTime?: number;
}

export interface ForecastScheduledResult {
  readonly status: 'COMPLETE' | 'FEATURE_OFF' | 'DB_UNAVAILABLE';
  readonly tenants: number;
  readonly candidates: number;
  readonly written: number;
  readonly insufficient: number;
  readonly failures: number;
}

interface TenantBranchRow {
  readonly tenant_id: string;
  readonly branch_id: string;
}

/** Pares tenant/branch con rollups recientes (misma fuente que consume el cron). */
async function listTenantBranches(
  db: D1DatabaseLike,
  startDate: string,
): Promise<readonly TenantBranchRow[]> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT tenant_id, branch_id
       FROM daily_product_rollups
       WHERE report_date >= ?
       ORDER BY tenant_id, branch_id`,
    )
    .bind(startDate)
    .all<TenantBranchRow>();
  return rows.results ?? [];
}

export async function runForecastScheduled(
  env: WorkerEnv,
  input: ForecastScheduledInput,
): Promise<ForecastScheduledResult> {
  if (!isAnalyticsForecastingEnabled(env)) {
    return {
      status: 'FEATURE_OFF',
      tenants: 0,
      candidates: 0,
      written: 0,
      insufficient: 0,
      failures: 0,
    };
  }
  if (!env.DB) {
    return {
      status: 'DB_UNAVAILABLE',
      tenants: 0,
      candidates: 0,
      written: 0,
      insufficient: 0,
      failures: 0,
    };
  }
  const nowMs = input.scheduledTime ?? Date.now();
  const startDate = historyWindowStart(nowMs, FORECAST_HISTORY_DAYS);

  const pairs = await listTenantBranches(env.DB, startDate);
  let candidates = 0;
  let written = 0;
  let insufficient = 0;
  let failures = 0;

  for (const pair of pairs) {
    const list = await listForecastCandidates(
      env.DB,
      pair.tenant_id,
      pair.branch_id,
      startDate,
      nowMs,
    );
    for (const candidate of list) {
      candidates += 1;
      try {
        const result = await writeForecastForCandidate(env.DB, candidate, nowMs);
        if (result.written) written += 1;
        else insufficient += 1;
      } catch {
        failures += 1;
      }
    }
  }

  console.log(
    JSON.stringify({
      event: 'forecast_scheduled_complete',
      tenants: pairs.length,
      candidates,
      written,
      insufficient,
      failures,
    }),
  );

  return {
    status: 'COMPLETE',
    tenants: pairs.length,
    candidates,
    written,
    insufficient,
    failures,
  };
}
