import { describe, expect, it } from 'vitest';
import {
  appendInsightLog,
  consumeAiUsage,
  listBriefingFacts,
  runInsightSelect,
  type InsightSessionDb,
} from './insights-repository.js';

interface SqlHandler {
  readonly sql: string;
  readonly all?: (params: readonly unknown[]) => unknown;
  readonly first?: (params: readonly unknown[]) => unknown;
  readonly run?: (params: readonly unknown[]) => { meta: { changes: number } };
}

function mockDb(handlers: readonly SqlHandler[]): InsightSessionDb {
  const match = (sql: string): SqlHandler =>
    handlers.find((handler) => sql.includes(handler.sql)) ?? { sql };
  const bound = (handler: SqlHandler, params: readonly unknown[]) => ({
    bind: () => bound(handler, params),
    all: <T = unknown>() =>
      Promise.resolve({
        results: (handler.all?.(params) ?? []) as T[],
        success: true,
        meta: {},
      }),
    first: <T = unknown>() => {
      const value = handler.first?.(params) ?? null;
      return Promise.resolve(value as T | null);
    },
    run: () =>
      Promise.resolve({
        results: [],
        success: true,
        meta: handler.run?.(params)?.meta ?? { changes: 1 },
      }),
  });
  const session = (sql: string) => {
    const handler = match(sql);
    return { bind: (...params: unknown[]) => bound(handler, params) };
  };
  return {
    prepare(sql: string) {
      const handler = match(sql);
      return { bind: (...params: unknown[]) => bound(handler, params) };
    },
    batch: () => Promise.resolve([]),
    withSession: () => ({ prepare: (sql: string) => session(sql) }) as never,
  };
}

describe('insights-repository unit (Sprint 49)', () => {
  const base = {
    tenantId: 't1',
    userId: 'u1',
    idempotencyKey: 'k1',
    interactionType: 'chat_query' as const,
    status: 'OK' as const,
    sqlExecuted: 'SELECT 1',
    factsJson: '{}',
    responseText: 'texto',
    modelVersion: 'm1',
    tokensIn: 1,
    tokensOut: 2,
  };

  it('appendInsightLog: duplicate true cuando el OR IGNORE no inserta', async () => {
    const db = mockDb([
      { sql: 'INSERT OR IGNORE INTO insight_log', run: () => ({ meta: { changes: 0 } }) },
    ]);
    expect((await appendInsightLog(db, base)).duplicate).toBe(true);
  });

  it('appendInsightLog: duplicate false en inserción nueva', async () => {
    const db = mockDb([
      { sql: 'INSERT OR IGNORE INTO insight_log', run: () => ({ meta: { changes: 1 } }) },
    ]);
    expect((await appendInsightLog(db, base)).duplicate).toBe(false);
  });

  it('consumeAiUsage: consume, excede cupo y crea el contador si falta', async () => {
    const db = mockDb([
      { sql: 'INSERT OR IGNORE INTO ai_usage_counters', run: () => ({ meta: { changes: 1 } }) },
      { sql: 'UPDATE ai_usage_counters', run: () => ({ meta: { changes: 1 } }) },
    ]);
    expect((await consumeAiUsage(db, 't1', '2026-08-04', 5, 10)).consumed).toBe(true);

    const exhausted = mockDb([
      { sql: 'INSERT OR IGNORE INTO ai_usage_counters', run: () => ({ meta: { changes: 0 } }) },
      { sql: 'UPDATE ai_usage_counters', run: () => ({ meta: { changes: 0 } }) },
    ]);
    await expect(consumeAiUsage(exhausted, 't1', '2026-08-04', 5, 10)).rejects.toThrow(
      'AI_QUOTA_EXCEEDED',
    );
  });

  it('runInsightSelect devuelve filas de la sesión réplica', async () => {
    const db = mockDb([
      { sql: 'SELECT t0.gross_sales_cents', all: () => [{ gross_sales_cents: 118000 }] },
    ]);
    const rows = await runInsightSelect({
      db,
      tenantId: 't1',
      sql: 'SELECT t0.gross_sales_cents',
      params: [],
    });
    expect(rows[0]).toMatchObject({ gross_sales_cents: 118000 });
  });

  it('listBriefingFacts: sin filas → ceros y arrays vacíos', async () => {
    const db = mockDb([
      { sql: 'SELECT COALESCE(SUM(gross_sales_cents)', first: () => null },
      { sql: 'FROM forecast_outputs', first: () => null },
      { sql: 'FROM daily_financial_rollups t0', all: () => [] },
    ]);
    const facts = await listBriefingFacts(db, 't1', '2026-08-03');
    expect(facts.sales.grossSalesCents).toBe(0);
    expect(facts.sales.docCount).toBe(0);
    expect(facts.breakage).toHaveLength(0);
    expect(facts.cashExceptions).toHaveLength(0);
  });

  it('listBriefingFacts: con filas proyecta ventas y excepciones', async () => {
    const db = mockDb([
      {
        sql: 'SELECT COALESCE(SUM(gross_sales_cents)',
        first: () => ({ gross_sales_cents: 118000, doc_count: 42 }),
      },
      { sql: 'FROM forecast_outputs', first: () => ({ p: 0, n: 2 }) },
      {
        sql: 'FROM daily_financial_rollups t0',
        all: () => [{ branch_code: 'C01', diff_cents: -5000 }],
      },
    ]);
    const facts = await listBriefingFacts(db, 't1', '2026-08-03');
    expect(facts.sales.grossSalesCents).toBe(118000);
    expect(facts.breakage).toHaveLength(1);
    expect(facts.cashExceptions[0]).toMatchObject({ branchCode: 'C01', diffCents: -5000 });
  });
});
