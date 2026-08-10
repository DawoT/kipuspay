/**
 * API de forecasting (Sprint 46 / ADR-0030, Arquitectura §5.3 regla 31).
 * Lectura de forecast_outputs; gating Cadena+: 403 PLAN_REQUIRES_CADENA semántico
 * (assertCadenaPlusPlan) y 402 Plan Guard vía /api/forecasting/ premium
 * (plan-routes). AE solo dashboards — nunca calcula ni decide (Principio 9).
 */
import {
  listForecastCandidates,
  writeForecastForCandidate,
} from '@kipuspay/adapters-d1/forecast-repository';
import type { WorkerEnv } from '../auth/control-plane.js';
import { assertCadenaPlusPlan, type HttpResult } from '../auth/plan-cadena.js';
import { isAnalyticsForecastingEnabled } from '../auth/features.js';
import { detectBreakage } from '@kipuspay/domain-analytics';

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function badRequest(reason: string): HttpResult {
  return { status: 400, body: { error: reason, code: 'BAD_REQUEST' } };
}

export interface ForecastRow {
  readonly product_id: string;
  readonly forecast_date: string;
  readonly predicted_qty: number;
  readonly predicted_gross_cents: number;
  readonly confidence_low_qty: number | null;
  readonly confidence_high_qty: number | null;
  readonly model_version: string;
}

/**
 * AE (Analytics Engine) — solo dashboards (ADR-0030, Principio 9). Muestreo bajo,
 * nunca fuente de forecast/facturación; falla silencioso si el binding no existe.
 */
function emitDashboardSample(
  env: WorkerEnv,
  tenantId: string,
  branchId: string,
  kind: 'list' | 'refresh' | 'alerts',
  items: number,
): void {
  try {
    env.ANALYTICS_ENGINE?.writeDataPoint({
      indexes: [`forecast:${kind}`, tenantId, branchId],
      doubles: [items],
      blobs: [kind, 'KipusPay', 'dashboard'],
    });
  } catch {
    /* AE muestreado: falla sin afectar la respuesta */
  }
}

/**
 * GET /api/forecasting/:branchId — pronósticos activos del branch.
 * Solo pronósticos de hoy en adelante; montos INTEGER cents.
 */
export async function runListForecastsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  branchId: string,
): Promise<HttpResult> {
  if (!isAnalyticsForecastingEnabled(env)) return featureOff('FEATURE_ANALYTICS_FORECASTING');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;
  if (!branchId) return badRequest('branchId required');

  const rows = await env.DB.prepare(
    `SELECT product_id, forecast_date, predicted_qty, predicted_gross_cents,
            confidence_low_qty, confidence_high_qty, model_version
     FROM forecast_outputs
     WHERE tenant_id = ? AND branch_id = ?
       AND forecast_date >= date('now', '-1 day')
     ORDER BY forecast_date DESC, product_id
     LIMIT 200`,
  )
    .bind(tenantId, branchId)
    .all<ForecastRow>();

  const items = rows.results ?? [];
  emitDashboardSample(env, tenantId, branchId, 'list', items.length);

  return {
    status: 200,
    body: {
      items,
      disclaimer: 'Estimación, no garantía',
    },
  };
}

/**
 * POST /api/forecasting/refresh — recalcula hoy de forma idempotente.
 * Reconstruye forecast_outputs para el día (DELETE+INSERT en db.batch).
 */
export async function runRefreshForecastHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  branchId: string,
): Promise<HttpResult> {
  if (!isAnalyticsForecastingEnabled(env)) return featureOff('FEATURE_ANALYTICS_FORECASTING');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;
  if (!branchId) return badRequest('branchId required');

  const startDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const candidates = await listForecastCandidates(
    env.DB,
    tenantId,
    branchId,
    startDate,
    Date.now(),
  );
  let written = 0;
  let insufficient = 0;
  for (const candidate of candidates) {
    const result = await writeForecastForCandidate(env.DB, candidate, Date.now());
    if (result.written) written += 1;
    else insufficient += 1;
  }
  emitDashboardSample(env, tenantId, branchId, 'refresh', written);
  return {
    status: 200,
    body: { written, insufficient, disclaimer: 'Estimación, no garantía' },
  };
}

/**
 * GET /api/forecasting/alerts/:branchId — alertas de quiebre (sugerencias, nunca
 * acciones automáticas de precio/stock). Cruza forecast_outputs con el stock
 * disponible y aplica la política leadTime + safetyStock.
 */
export async function runStockAlertsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  branchId: string,
  query: Record<string, string | undefined>,
): Promise<HttpResult> {
  if (!isAnalyticsForecastingEnabled(env)) return featureOff('FEATURE_ANALYTICS_FORECASTING');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const lead = Number(query.leadTimeDays ?? '');
  const safety = Number(query.safetyStockDays ?? '');
  if (!branchId || !Number.isFinite(lead) || !Number.isFinite(safety) || lead < 0 || safety < 0) {
    return badRequest('branchId, leadTimeDays y safetyStockDays requeridos (>= 0)');
  }

  const rows = await env.DB.prepare(
    `SELECT f.product_id, f.predicted_qty, s.stock
     FROM forecast_outputs f
     LEFT JOIN branch_product_stock s
       ON s.tenant_id = f.tenant_id AND s.branch_id = f.branch_id AND s.product_id = f.product_id
     WHERE f.tenant_id = ? AND f.branch_id = ?
       AND f.forecast_date >= date('now', '-1 day')
     ORDER BY f.predicted_qty DESC
     LIMIT 200`,
  )
    .bind(tenantId, branchId)
    .all<{ product_id: string; predicted_qty: number; stock: number | null }>();

  const items = (rows.results ?? []).map((r) => {
    const analysis = detectBreakage({
      predictedDailyQty: r.predicted_qty,
      stockAvailable: r.stock ?? 0,
      leadTimeDays: lead,
      safetyStockDays: safety,
    });
    return {
      product_id: r.product_id,
      status: analysis.status,
      daysCovered: analysis.daysCovered,
      suggestedReorderQty: analysis.suggestedReorderQty,
      targetDays: analysis.targetDays,
    };
  });

  emitDashboardSample(env, tenantId, branchId, 'alerts', items.length);

  return {
    status: 200,
    body: {
      items,
      disclaimer: 'Estimación, no garantía',
    },
  };
}
