import { describe, expect, it } from 'vitest';
import {
  computeForecast,
  hasEnoughHistory,
  holtWinters,
  weightedMovingAverage,
  type DailySalesPoint,
} from './forecast.js';

function series(
  days: number,
  base: number,
  slope: number,
  weeklyBump: (d: number) => number,
): DailySalesPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const qty = base + slope * i + weeklyBump(i % 7);
    return {
      reportDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      qty,
      grossCents: Math.round(qty * 1000),
    };
  });
}

function linearSeries(days: number, base: number, slope: number): DailySalesPoint[] {
  return series(days, base, slope, () => 0);
}

describe('hasEnoughHistory', () => {
  it('rejects empty series', () => {
    expect(hasEnoughHistory([])).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(hasEnoughHistory([{ reportDate: '2026-01-01', qty: Number.NaN, grossCents: 1 }])).toBe(
      false,
    );
  });

  it('accepts a valid series', () => {
    expect(hasEnoughHistory(linearSeries(10, 5, 1))).toBe(true);
  });
});

describe('holtWinters', () => {
  it('tracks a linear trend closely', () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
    const { forecast, residuals } = holtWinters(
      values,
      { alpha: 0.5, beta: 0.5, gamma: 0.1, period: 7 },
      1,
    );
    expect(forecast[0]).toBeGreaterThan(200);
    expect(Math.abs(forecast[0]! - 220)).toBeLessThan(25);
    expect(residuals.length).toBeGreaterThan(0);
  });

  it('captures weekly seasonality', () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + (i % 7) * 10);
    const { forecast } = holtWinters(values, { alpha: 0.5, beta: 0.1, gamma: 0.5, period: 7 }, 1);
    // Siguiente paso = índice 60, que cae en el mismo día de la semana que índice 60%7=4
    expect(forecast[0]!).toBeGreaterThan(120);
    expect(forecast[0]!).toBeLessThan(170);
  });

  it('forecasts multiple horizons', () => {
    const values = Array.from({ length: 60 }, (_, i) => 50 + i);
    const { forecast } = holtWinters(values, { alpha: 0.5, beta: 0.4, gamma: 0.1, period: 7 }, 5);
    expect(forecast).toHaveLength(5);
    expect(forecast[4]!).toBeGreaterThan(forecast[0]!);
  });

  it('produces finite residuals for constant series', () => {
    const values = Array.from({ length: 30 }, () => 42);
    const { residuals } = holtWinters(values, { alpha: 0.3, beta: 0.1, gamma: 0.2, period: 7 }, 1);
    expect(residuals.every(Number.isFinite)).toBe(true);
  });

  it('degrades gracefully when the series is shorter than period', () => {
    const { forecast, residuals } = holtWinters(
      [100, 110],
      { alpha: 0.5, beta: 0.1, gamma: 0.3, period: 7 },
      1,
    );
    expect(forecast).toHaveLength(1);
    expect(Number.isFinite(forecast[0])).toBe(true);
    expect(residuals).toHaveLength(0);
  });

  it('handles exactly period-length series with no residual loop', () => {
    const values = Array.from({ length: 7 }, (_, i) => 100 + i);
    const { residuals } = holtWinters(values, { alpha: 0.5, beta: 0.1, gamma: 0.3, period: 7 }, 1);
    expect(residuals).toHaveLength(0);
  });

  it('recovers a seasonality signal on a long series', () => {
    const values = Array.from({ length: 70 }, (_, i) => 100 + (i % 7) * 10);
    const { forecast } = holtWinters(values, { alpha: 0.4, beta: 0.1, gamma: 0.6, period: 7 }, 1);
    // El índice 70%7=0 repite el nivel estacional del día 0 (100) más nivel.
    expect(forecast[0]!).toBeGreaterThan(100);
    expect(forecast[0]!).toBeLessThan(200);
  });
});

describe('weightedMovingAverage', () => {
  it('returns horizon-length baseline', () => {
    const out = weightedMovingAverage([1, 2, 3, 4], 3);
    expect(out).toHaveLength(3);
  });

  it('returns empty for empty series', () => {
    expect(weightedMovingAverage([], 2)).toHaveLength(0);
  });

  it('uses a capped 7-point window on long series', () => {
    const long = Array.from({ length: 20 }, (_, i) => i + 1);
    const out = weightedMovingAverage(long, 3);
    expect(out).toHaveLength(3);
    expect(out[0]!).toBeGreaterThan(10);
    expect(out[0]!).toBeLessThan(20);
  });

  it('returns a flat baseline for a single point', () => {
    expect(weightedMovingAverage([42], 2)).toEqual([42, 42]);
  });

  it('weights recent values higher', () => {
    // WMA de [0,0,100] con pesos 1,2,3: (0+0+300)/6 = 50, arriba de la media simple 33.3
    const out = weightedMovingAverage([0, 0, 100], 1);
    expect(out[0]!).toBe(50);
    expect(out[0]!).toBeGreaterThan(33.3);
  });
});

describe('computeForecast', () => {
  it('reports INSUFFICIENT_DATA for empty input', () => {
    const out = computeForecast([]);
    expect(out.status).toBe('INSUFFICIENT_DATA');
    expect(out.modelVersion).toBe('insufficient-data-v1');
  });

  it('reports INSUFFICIENT_DATA for non-finite values', () => {
    const out = computeForecast([{ reportDate: '2026-01-01', qty: Number.NaN, grossCents: 1 }]);
    expect(out.status).toBe('INSUFFICIENT_DATA');
  });

  it('uses WMA fallback for short series', () => {
    const out = computeForecast(linearSeries(10, 5, 0));
    expect(out.status).toBe('OK');
    expect(out.modelVersion).toBe('wma-fallback-v1');
    expect(out.predictedQty).toBeGreaterThan(0);
  });

  it('uses Holt-Winters for a long trending series', () => {
    const out = computeForecast(linearSeries(70, 100, 1));
    expect(out.status).toBe('OK');
    expect(out.modelVersion).toBe('holt-winters-v1');
    expect(out.predictedGrossCents).toBeGreaterThan(0);
    expect(Number.isInteger(out.predictedGrossCents)).toBe(true);
    expect(out.confidenceHighQty).toBeGreaterThanOrEqual(out.confidenceLowQty);
    expect(out.trainPoints).toBe(70);
  });

  it('never produces negative predictions', () => {
    const out = computeForecast(series(70, 0, 0, (d) => (d === 6 ? 0 : 0)));
    expect(out.predictedQty).toBeGreaterThanOrEqual(0);
    expect(out.confidenceLowQty).toBeGreaterThanOrEqual(0);
  });

  it('honours a custom horizon', () => {
    const out = computeForecast(linearSeries(70, 100, 1), 5);
    expect(out.status).toBe('OK');
  });

  it('clamps negative gross to zero (INTEGER cents invariant)', () => {
    const out = computeForecast(series(20, 5, 0, () => 0).map((p) => ({ ...p, grossCents: -100 })));
    expect(out.predictedGrossCents).toBe(0);
    expect(out.predictedQty).toBeGreaterThanOrEqual(0);
  });

  it('treats non-finite grossCents as insufficient data', () => {
    const out = computeForecast([{ reportDate: '2026-01-01', qty: 5, grossCents: Number.NaN }]);
    expect(out.status).toBe('INSUFFICIENT_DATA');
  });

  it('clamps short-series fallback to non-negative gross cents', () => {
    const out = computeForecast(linearSeries(10, 5, 0).map((p) => ({ ...p, grossCents: -50 })));
    expect(out.modelVersion).toBe('wma-fallback-v1');
    expect(out.predictedGrossCents).toBe(0);
  });
});
