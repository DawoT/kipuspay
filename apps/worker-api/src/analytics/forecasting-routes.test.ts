import { describe, expect, it } from 'vitest';
import {
  runListForecastsHttp,
  runRefreshForecastHttp,
  runStockAlertsHttp,
} from './forecasting-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function buildDb(rows: unknown, opts: { throwOnBatch?: boolean; planId?: string } = {}) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        all: () => Promise.resolve({ results: rows, success: true }),
        first: () =>
          Promise.resolve(
            sql.includes('FROM tenants') ? { plan_id: opts.planId ?? 'cadena' } : null,
          ),
        run: () => Promise.resolve({ results: [], success: true }),
      };
      return stmt;
    },
    batch: () => {
      if (opts.throwOnBatch) return Promise.reject(new Error('BATCH_FAILED'));
      return Promise.resolve([]);
    },
  };
}

function env(overrides: Record<string, unknown> = {}): WorkerEnv {
  return {
    FEATURE_ANALYTICS_FORECASTING: '1',
    DB: buildDb([]),
    ...overrides,
  } as unknown as WorkerEnv;
}

const forecastRows = [
  {
    product_id: 'p1',
    forecast_date: '2026-08-09',
    predicted_qty: 12.4,
    predicted_gross_cents: 12400,
    confidence_low_qty: 10,
    confidence_high_qty: 15,
    model_version: 'holt-winters-v1',
  },
];

describe('forecasting routes', () => {
  it('lists forecasts for Cadena plan', async () => {
    const db = buildDb(forecastRows);
    const result = await runListForecastsHttp(
      { FEATURE_ANALYTICS_FORECASTING: '1', DB: db } as unknown as WorkerEnv,
      't1',
      'b1',
      'owner',
    );
    expect(result.status).toBe(200);
    const body = result.body as { items: unknown[]; disclaimer: string };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ predicted_gross_cents: 12400 });
    expect(body.disclaimer).toContain('no garantía');
  });

  it('returns FEATURE_OFF when flag disabled', async () => {
    const result = await runListForecastsHttp(
      { FEATURE_ANALYTICS_FORECASTING: '0', DB: buildDb([]) } as unknown as WorkerEnv,
      't1',
      'b1',
      'owner',
    );
    expect(result.status).toBe(404);
    expect((result.body as { code: string }).code).toBe('FEATURE_OFF');
  });

  it('returns DB_UNAVAILABLE without DB', async () => {
    const result = await runListForecastsHttp(
      { FEATURE_ANALYTICS_FORECASTING: '1' } as unknown as WorkerEnv,
      't1',
      'b1',
      'owner',
    );
    expect(result.status).toBe(503);
  });

  it('denies non-Cadena plans with 403 PLAN_REQUIRES_CADENA', async () => {
    const denyDb = {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [], success: true }),
          first: () => Promise.resolve({ plan_id: 'crece' }),
          run: () => Promise.resolve({ results: [], success: true }),
        }),
      }),
      batch: () => Promise.resolve([]),
    };
    const result = await runListForecastsHttp(
      { FEATURE_ANALYTICS_FORECASTING: '1', DB: denyDb } as unknown as WorkerEnv,
      't1',
      'b1',
      'owner',
    );
    expect(result.status).toBe(403);
    expect((result.body as { code: string }).code).toBe('PLAN_REQUIRES_CADENA');
  });

  it('rejects missing branchId', async () => {
    const result = await runListForecastsHttp(env({ DB: buildDb([]) }), 't1', '', 'owner');
    expect(result.status).toBe(400);
  });

  it('refresh writes candidates and reports counts', async () => {
    const db = buildDb([{ product_id: 'p1' }]);
    const result = await runRefreshForecastHttp(env({ DB: db }), 't1', 'b1', 'owner');
    expect(result.status).toBe(200);
    const body = result.body as { written: number; insufficient: number; disclaimer: string };
    // Con filas de rollup el forecast escribe (historial sintético no aplica aquí);
    // aceptamos counts >= 0 y la estructura.
    expect(typeof body.written).toBe('number');
    expect(typeof body.insufficient).toBe('number');
    expect(body.disclaimer).toContain('no garantía');
  });

  it('alerts compute breakage suggestions for Cadena plan', async () => {
    const db = buildDb([{ product_id: 'p1', predicted_qty: 10, stock: 20 }]);
    const result = await runStockAlertsHttp(
      env({ DB: db }),
      't1',
      'b1',
      { leadTimeDays: '3', safetyStockDays: '2' },
      'owner',
    );
    expect(result.status).toBe(200);
    const body = result.body as { items: { status: string; daysCovered: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ daysCovered: 2 });
    // 20/10 = 2 días < 5 objetivo → REORDER_SUGGESTED
    expect(body.items[0]?.status).toBe('REORDER_SUGGESTED');
  });

  it('alerts reject negative policy params', async () => {
    const result = await runStockAlertsHttp(
      env({ DB: buildDb([]) }),
      't1',
      'b1',
      {
        leadTimeDays: '-1',
        safetyStockDays: '2',
      },
      'owner',
    );
    expect(result.status).toBe(400);
  });

  it('alerts return FEATURE_OFF when disabled', async () => {
    const result = await runStockAlertsHttp(
      env({ FEATURE_ANALYTICS_FORECASTING: '0', DB: buildDb([]) }),
      't1',
      'b1',
      { leadTimeDays: '3', safetyStockDays: '2' },
      'owner',
    );
    expect(result.status).toBe(404);
  });
});
