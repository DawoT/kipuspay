/**
 * Modelo de forecasting determinista (ADR-0030, Arquitectura §5.3 regla 31).
 * Triple exponential smoothing (Holt-Winters) en TS puro, sin dependencias npm.
 * D1 es la única calculadora (Principio 9): este módulo recibe series ya leídas
 * de daily_product_rollups y no toca bases de datos.
 *
 * Invariante dinero: predicted_gross_cents es INTEGER cents (server-side, Math.round).
 * predicted_qty es cantidad (REAL permitido, V-06).
 */

export interface DailySalesPoint {
  readonly reportDate: string;
  readonly qty: number;
  readonly grossCents: number;
}

export interface HoltWintersParams {
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
  readonly period: number;
}

export const DEFAULT_HOLT_WINTERS: HoltWintersParams = {
  alpha: 0.5,
  beta: 0.1,
  gamma: 0.3,
  period: 7,
};

/** Serie sin historial suficiente para Holt-Winters. */
export const MIN_SERIES_LENGTH = 2 * 7;

export type ForecastStatus = 'OK' | 'INSUFFICIENT_DATA';

export interface ForecastOutput {
  readonly status: ForecastStatus;
  readonly modelVersion: string;
  /** Pronóstico de cantidad (REAL, unidad de venta). */
  readonly predictedQty: number;
  /** Pronóstico de ingreso en cents enteros (INTEGER cents). */
  readonly predictedGrossCents: number;
  readonly confidenceLowQty: number;
  readonly confidenceHighQty: number;
  /** MAPE de holdout como porcentaje (0-100); null si no hubo test set. */
  readonly holdoutMapePercent: number | null;
  /** Historial usado para entrenar. */
  readonly trainPoints: number;
}

/**
 * Serie con suficientes puntos y valores finitos. Devuelve null si no hay datos.
 */
export function hasEnoughHistory(points: readonly DailySalesPoint[]): boolean {
  if (points.length === 0) return false;
  return points.every((p) => Number.isFinite(p.qty) && Number.isFinite(p.grossCents));
}

/**
 * Descomposición Holt-Winters aditiva. `series` debe tener >= period*2 puntos.
 * Devuelve el pronóstico para los próximos `horizon` pasos y los residuales del
 * entrenamiento (para el intervalo de confianza).
 */
export function holtWinters(
  series: readonly number[],
  params: HoltWintersParams,
  horizon: number,
): { readonly forecast: readonly number[]; readonly residuals: readonly number[] } {
  const { alpha, beta, gamma, period } = params;
  const n = series.length;

  const season = Array.from({ length: period }, () => 0);
  const baseLevel = series.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period; i += 1) {
    // series[i] puede no existir si el llamador viola el precontrato (series.length < period).
    season[i] = (series[i] ?? 0) - baseLevel;
  }

  let level = baseLevel;
  // Igual caso límite: series.length <= period deja series[period] indefinido.
  let trend = (series[period] ?? baseLevel) - baseLevel;

  const residuals: number[] = [];

  for (let i = period; i < n; i += 1) {
    const actual = series[i]!;
    const seasonalIndex = (i - period) % period;
    const seasonalValue = season[seasonalIndex]!;

    const lastLevel = level;
    level = alpha * (actual - seasonalValue) + (1 - alpha) * (level + trend);
    trend = beta * (level - lastLevel) + (1 - beta) * trend;
    season[seasonalIndex] = gamma * (actual - level) + (1 - gamma) * seasonalValue;

    const fitted = lastLevel + trend + seasonalValue;
    residuals.push(actual - fitted);
  }

  const forecast: number[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    const seasonalIndex = (period - 1 + (h - 1)) % period;
    forecast.push(level + h * trend + season[seasonalIndex]!);
  }

  return { forecast, residuals };
}

/**
 * Fallback explícito para series cortas: media móvil ponderada (WMA) de la última
 * semana. Nunca inventa series: devuelve status INSUFFICIENT_DATA si no hay datos.
 */
export function weightedMovingAverage(
  series: readonly number[],
  horizon: number,
): readonly number[] {
  if (series.length === 0) return [];
  const window = Math.min(7, series.length);
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < window; i += 1) {
    const w = i + 1;
    weights.push(w);
    weightSum += w;
  }
  const recent = series.slice(series.length - window);
  const base = recent.reduce((sum, v, i) => sum + v * weights[i]!, 0) / weightSum;
  return Array.from({ length: horizon }, () => base);
}

function positive(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Entrena el modelo sobre la serie histórica y produce el pronóstico del día
 * siguiente (horizon = 1) con su intervalo de confianza al 80% (z ~ 1.282).
 * Predice qty y grossCents de forma independiente sobre sus propias series.
 */
export function computeForecast(
  points: readonly DailySalesPoint[],
  horizon = 1,
  params: HoltWintersParams = DEFAULT_HOLT_WINTERS,
): ForecastOutput {
  if (!hasEnoughHistory(points)) {
    return {
      status: 'INSUFFICIENT_DATA',
      modelVersion: 'insufficient-data-v1',
      predictedQty: 0,
      predictedGrossCents: 0,
      confidenceLowQty: 0,
      confidenceHighQty: 0,
      holdoutMapePercent: null,
      trainPoints: 0,
    };
  }

  const qtySeries = points.map((p) => p.qty);
  const grossSeries = points.map((p) => p.grossCents);
  if (qtySeries.length < MIN_SERIES_LENGTH || grossSeries.length < MIN_SERIES_LENGTH) {
    const qtyWma = weightedMovingAverage(qtySeries, horizon);
    const grossWma = weightedMovingAverage(grossSeries, horizon);
    const predictedQty = qtyWma[0]!;
    const predictedGross = positive(grossWma[0]!);
    return {
      status: 'OK',
      modelVersion: 'wma-fallback-v1',
      predictedQty: positive(predictedQty),
      predictedGrossCents: Math.round(predictedGross),
      confidenceLowQty: 0,
      confidenceHighQty: 0,
      holdoutMapePercent: null,
      trainPoints: points.length,
    };
  }

  const qtyHw = holtWinters(qtySeries, params, horizon);
  const grossHw = holtWinters(grossSeries, params, horizon);

  const predictedQty = positive(qtyHw.forecast[0]!);
  const predictedGross = positive(grossHw.forecast[0]!);

  const qtySigma = residualStddev(qtyHw.residuals);
  const z = 1.282;

  return {
    status: 'OK',
    modelVersion: 'holt-winters-v1',
    predictedQty,
    predictedGrossCents: Math.round(predictedGross),
    confidenceLowQty: positive(predictedQty - z * qtySigma),
    confidenceHighQty: predictedQty + z * qtySigma,
    holdoutMapePercent: null,
    trainPoints: points.length,
  };
}

function residualStddev(residuals: readonly number[]): number {
  if (residuals.length === 0) return 0;
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance =
    residuals.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) / residuals.length;
  return Math.sqrt(variance);
}
