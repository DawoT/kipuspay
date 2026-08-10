import { describe, expect, it, vi } from 'vitest';
import { runForecastScheduled } from './forecast-scheduled.js';
import type { D1DatabaseLike } from '@kipuspay/adapters-d1';

const NOW = Date.parse('2026-08-09T13:30:00.000Z');

function pairRows(): { tenant_id: string; branch_id: string }[] {
  return [
    { tenant_id: 't1', branch_id: 'b1' },
    { tenant_id: 't2', branch_id: 'b2' },
  ];
}

function candidateRows(): { product_id: string }[] {
  return [{ product_id: 'p1' }, { product_id: 'p2' }];
}

function buildDb(overrides: Partial<D1DatabaseLike> = {}): D1DatabaseLike {
  const prepare = (sql: string) => ({
    bind: () => ({
      all: () =>
        Promise.resolve({
          results: sql.includes('GROUP BY product_id') ? candidateRows() : pairRows(),
          success: true,
        }),
      first: () => Promise.resolve(null),
      run: () => Promise.resolve({ results: [], success: true }),
    }),
  });
  return { prepare, batch: () => Promise.resolve([]), ...overrides } as unknown as D1DatabaseLike;
}

function env(overrides: Record<string, unknown> = {}): unknown {
  return { FEATURE_ANALYTICS_FORECASTING: '1', DB: buildDb(), ...overrides };
}

describe('runForecastScheduled', () => {
  it('returns FEATURE_OFF when the flag is disabled', async () => {
    const result = await runForecastScheduled(
      env({ FEATURE_ANALYTICS_FORECASTING: '0' }) as never,
      {
        scheduledTime: NOW,
      },
    );
    expect(result.status).toBe('FEATURE_OFF');
    expect(result.candidates).toBe(0);
  });

  it('returns DB_UNAVAILABLE without a DB binding', async () => {
    const result = await runForecastScheduled({ FEATURE_ANALYTICS_FORECASTING: '1' } as never, {
      scheduledTime: NOW,
    });
    expect(result.status).toBe('DB_UNAVAILABLE');
  });

  it('runs candidates for every tenant/branch pair', async () => {
    const db = buildDb();
    const spy = vi.spyOn(db, 'prepare');
    const result = await runForecastScheduled(
      { FEATURE_ANALYTICS_FORECASTING: '1', DB: db } as never,
      { scheduledTime: NOW },
    );
    expect(result.status).toBe('COMPLETE');
    expect(result.tenants).toBe(2);
    // 2 pares × 2 candidatos = 4 candidatos
    expect(result.candidates).toBe(4);
    // El prepare para listar pares usa daily_product_rollups sin GROUP BY product_id.
    expect(spy).toHaveBeenCalled();
  });

  it('keeps counters at zero with no rollup rows', async () => {
    const emptyDb = {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [], success: true }),
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ results: [], success: true }),
        }),
      }),
      batch: () => Promise.resolve([]),
    } as unknown as D1DatabaseLike;
    const result = await runForecastScheduled(
      { FEATURE_ANALYTICS_FORECASTING: '1', DB: emptyDb } as never,
      { scheduledTime: NOW },
    );
    expect(result.status).toBe('COMPLETE');
    expect(result.candidates).toBe(0);
    expect(result.written).toBe(0);
  });

  it('counts failures when a write throws', async () => {
    const historyRows = Array.from({ length: 30 }, (_, i) => ({
      report_date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      qty: 50 + i,
      gross_cents: (50 + i) * 1000,
    }));
    const failingDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: () =>
            Promise.resolve({
              results: sql.includes('GROUP BY product_id')
                ? [{ product_id: 'p1' }]
                : sql.includes('daily_product_rollups') && sql.includes('SELECT DISTINCT')
                  ? pairRows()
                  : historyRows,
              success: true,
            }),
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ results: [], success: true }),
        }),
      }),
      batch: () => Promise.reject(new Error('BATCH_FAILED')),
    } as unknown as D1DatabaseLike;
    const result = await runForecastScheduled(
      { FEATURE_ANALYTICS_FORECASTING: '1', DB: failingDb } as never,
      { scheduledTime: NOW },
    );
    expect(result.status).toBe('COMPLETE');
    expect(result.failures).toBeGreaterThan(0);
  });
});
