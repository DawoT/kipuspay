/**
 * Repositorio de forecasting (Arquitectura §5.3 regla 31 / ADR-0030).
 *
 * D1 es la única calculadora (Principio 9): este repositorio lee el historial de
 * daily_product_rollups, delega el modelo al dominio puro @kipuspay/domain-analytics
 * y persiste forecast_outputs. Escritura idempotente DELETE+INSERT en una sola
 * `db.batch([...])` (invariante D1). Nunca UPSERT INTO.
 */
import { computeForecast, type DailySalesPoint } from '@kipuspay/domain-analytics';
import type { D1Bound, D1DatabaseLike } from './index.js';

/** Ventana de historial a leer: 90 días naturales (14 mínimos para Holt-Winters). */
export const FORECAST_HISTORY_DAYS = 90;

export interface ForecastProductRow {
  readonly report_date: string;
  readonly qty: number;
  readonly gross_cents: number;
}

export interface ForecastCandidate {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly forecastDate: string;
}

export interface ForecastWriteResult {
  readonly candidateId: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly status: 'OK' | 'INSUFFICIENT_DATA';
  readonly written: boolean;
  readonly predictedGrossCents: number;
}

/** Fecha de inicio de la ventana (hoy Lima - N días) como 'YYYY-MM-DD'. */
export function historyWindowStart(nowMs: number, days = FORECAST_HISTORY_DAYS): string {
  const lima = new Date(nowMs - 5 * 3600 * 1000);
  lima.setUTCDate(lima.getUTCDate() - days);
  const y = lima.getUTCFullYear();
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0');
  const d = String(lima.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fecha Lima de hoy como 'YYYY-MM-DD' (forecast_date del día). */
export function todayLima(nowMs: number): string {
  const lima = new Date(nowMs - 5 * 3600 * 1000);
  const y = lima.getUTCFullYear();
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0');
  const d = String(lima.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Lee el historial ordenado por fecha (ascendente) para un tenant/branch/producto. */
export async function loadHistoryForProduct(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  productId: string,
  startDate: string,
): Promise<readonly DailySalesPoint[]> {
  const rows = await db
    .prepare(
      `SELECT report_date, qty, gross_cents
       FROM daily_product_rollups
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
         AND report_date >= ?
       ORDER BY report_date ASC`,
    )
    .bind(tenantId, branchId, productId, startDate)
    .all<ForecastProductRow>();
  return (rows.results ?? []).map((r) => ({
    reportDate: r.report_date,
    qty: r.qty,
    grossCents: r.gross_cents,
  }));
}

/**
 * Calcula el pronóstico de un candidato y lo persiste de forma idempotente.
 * Devuelve la escritura solo cuando hay datos suficientes; con historial corto
 * no escribe nada (status INSUFFICIENT_DATA) para no inventar series.
 */
export async function writeForecastForCandidate(
  db: D1DatabaseLike,
  candidate: ForecastCandidate,
  nowMs: number,
): Promise<ForecastWriteResult> {
  const startDate = historyWindowStart(nowMs);
  const history = await loadHistoryForProduct(
    db,
    candidate.tenantId,
    candidate.branchId,
    candidate.productId,
    startDate,
  );

  const output = computeForecast(history);
  const written = output.status === 'OK';
  const predictedGrossCents = output.status === 'OK' ? output.predictedGrossCents : 0;

  if (written) {
    const id = [
      candidate.tenantId,
      candidate.branchId,
      candidate.productId,
      candidate.forecastDate,
    ].join(':');
    const stmts: D1Bound[] = [
      db
        .prepare(
          `DELETE FROM forecast_outputs
           WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND forecast_date = ?`,
        )
        .bind(candidate.tenantId, candidate.branchId, candidate.productId, candidate.forecastDate),
      db
        .prepare(
          `INSERT INTO forecast_outputs (
             id, tenant_id, branch_id, product_id, forecast_date,
             predicted_qty, predicted_gross_cents,
             confidence_low_qty, confidence_high_qty, model_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          candidate.tenantId,
          candidate.branchId,
          candidate.productId,
          candidate.forecastDate,
          output.predictedQty,
          output.predictedGrossCents,
          output.confidenceLowQty,
          output.confidenceHighQty,
          output.modelVersion,
        ),
    ];
    await db.batch(stmts);
  }

  return {
    candidateId: `${candidate.tenantId}:${candidate.branchId}:${candidate.productId}`,
    tenantId: candidate.tenantId,
    branchId: candidate.branchId,
    productId: candidate.productId,
    status: output.status,
    written,
    predictedGrossCents,
  };
}

/** Lista los candidatos de un tenant/branch con actividad reciente (forecast_date = hoy Lima). */
export async function listForecastCandidates(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  startDate: string,
  nowMs: number,
  limit = 500,
): Promise<readonly ForecastCandidate[]> {
  const forecastDate = todayLima(nowMs);
  const rows = await db
    .prepare(
      `SELECT product_id
       FROM daily_product_rollups
       WHERE tenant_id = ? AND branch_id = ? AND report_date >= ?
       GROUP BY product_id
       ORDER BY MAX(report_date) DESC
       LIMIT ?`,
    )
    .bind(tenantId, branchId, startDate, limit)
    .all<{ product_id: string }>();
  return (rows.results ?? []).map((r) => ({
    tenantId,
    branchId,
    productId: r.product_id,
    forecastDate,
  }));
}
