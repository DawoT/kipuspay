import { describe, expect, it, vi } from 'vitest';
import {
  historyWindowStart,
  listForecastCandidates,
  loadHistoryForProduct,
  todayLima,
  writeForecastForCandidate,
} from './forecast-repository.js';
import type { D1DatabaseLike } from './index.js';

function buildRollupRows(
  days: number,
): { report_date: string; qty: number; gross_cents: number }[] {
  const start = new Date('2026-04-01T00:00:00.000Z');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return {
      report_date: `${y}-${m}-${day}`,
      qty: 50 + i,
      gross_cents: (50 + i) * 1000,
    };
  });
}

function mockDb(overrides: Partial<D1DatabaseLike> = {}): {
  db: D1DatabaseLike;
  prepare: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
} {
  const rows = buildRollupRows(70);
  const candidates = rows.map((r) => ({ product_id: r.report_date }));
  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      all: vi.fn(() =>
        Promise.resolve({
          results: sql.includes('GROUP BY product_id') ? candidates : rows,
          success: true,
        }),
      ),
      first: vi.fn(() => Promise.resolve(null)),
      run: vi.fn(() => Promise.resolve({ results: [], success: true })),
    })),
  }));
  const batch = vi.fn(() => Promise.resolve([]));
  const db = { prepare, batch, ...overrides } as unknown as D1DatabaseLike;
  return { db, prepare, batch };
}

const NOW = Date.parse('2026-08-05T12:00:00.000Z');

describe('forecast-repository', () => {
  it('todayLima y historyWindowStart computan en zona Lima', () => {
    // 12:00 UTC = 07:00 Lima → mismo día
    expect(todayLima(NOW)).toBe('2026-08-05');
    const start = historyWindowStart(NOW, 90);
    expect(start).toBe('2026-05-07');
  });

  it('historyWindowStart con días por defecto', () => {
    expect(historyWindowStart(NOW)).toBe('2026-05-07');
  });

  it('loadHistoryForProduct mapea a DailySalesPoint ascendente', async () => {
    const { db } = mockDb();
    const history = await loadHistoryForProduct(db, 't1', 'b1', 'p1', '2026-01-01');
    expect(history).toHaveLength(70);
    expect(history[0]).toEqual({ reportDate: '2026-04-01', qty: 50, grossCents: 50000 });
    expect(history[69]).toEqual({ reportDate: '2026-06-09', qty: 119, grossCents: 119000 });
  });

  it('listForecastCandidates devuelve forecast_date = hoy Lima', async () => {
    const { db } = mockDb();
    const candidates = await listForecastCandidates(db, 't1', 'b1', '2026-05-01', NOW);
    expect(candidates).toHaveLength(70);
    expect(candidates[0]).toEqual({
      tenantId: 't1',
      branchId: 'b1',
      productId: '2026-04-01',
      forecastDate: '2026-08-05',
    });
  });

  it('writeForecastForCandidate persiste con batch (DELETE+INSERT) cuando hay historial', async () => {
    const { db, prepare, batch } = mockDb();
    const result = await writeForecastForCandidate(
      db,
      { tenantId: 't1', branchId: 'b1', productId: 'p1', forecastDate: '2026-08-05' },
      NOW,
    );
    expect(result.status).toBe('OK');
    expect(result.written).toBe(true);
    expect(result.predictedGrossCents).toBeGreaterThan(0);
    expect(batch).toHaveBeenCalledTimes(1);
    // prepare se llama: SELECT historial, DELETE forecast, INSERT forecast.
    const sqls = prepare.mock.calls.map((c: string[]) => c[0]);
    expect(sqls.some((s?: string) => s?.includes('DELETE FROM forecast_outputs'))).toBe(true);
    expect(sqls.some((s?: string) => s?.includes('INSERT INTO forecast_outputs'))).toBe(true);
    const batchStmts = batch.mock.calls[0]?.[0] as readonly unknown[];
    expect(batchStmts).toHaveLength(2);
  });

  it('writeForecastForCandidate no escribe con historial insuficiente', async () => {
    const batch = vi.fn(() => Promise.resolve([])) as unknown as D1DatabaseLike['batch'];
    const emptyDb = {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ success: true }),
        }),
      }),
      batch,
    } as unknown as D1DatabaseLike;
    const result = await writeForecastForCandidate(
      emptyDb,
      { tenantId: 't1', branchId: 'b1', productId: 'p1', forecastDate: '2026-08-05' },
      NOW,
    );
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.written).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });
});
