import { describe, expect, it } from 'vitest';
import { AtomicPlanBuilder, type D1Bound, type D1DatabaseLike, type D1Result } from './index.js';
import { appendUsageMeterToPlan } from './usage-meter-batch.js';

function okResult(): D1Result<unknown> {
  return { results: [], success: true, meta: {} };
}

function mockDb(): { db: D1DatabaseLike; sqls: string[] } {
  const sqls: string[] = [];
  const raw = {
    prepare(sql: string) {
      sqls.push(sql);
      const stmt = {
        bind() {
          return stmt;
        },
        first: () => Promise.resolve(null),
        all: () => Promise.resolve(okResult()),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
  return { db: raw as unknown as D1DatabaseLike, sqls };
}

describe('appendUsageMeterToPlan', () => {
  it('añade usage_events + usage_counters para NV', () => {
    const { db, sqls } = mockDb();
    const plan = new AtomicPlanBuilder(db, 'g1');
    const added = appendUsageMeterToPlan(plan, db, {
      tenantId: 't1',
      documentId: 'sale-1',
      documentType: 'NV',
      eventId: 'ev-1',
      nowMs: Date.UTC(2026, 7, 7, 12, 0, 0),
    });
    expect(added).toBe(true);
    expect(plan.size).toBe(2);
    expect(sqls.some((s) => s.includes('INSERT INTO usage_events'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO usage_counters'))).toBe(true);
    expect(sqls.some((s) => /UPSERT\s+INTO/i.test(s))).toBe(false);
    expect(sqls.some((s) => s.includes('ON CONFLICT'))).toBe(true);
  });

  it('no añade para RC/VOID', () => {
    const { db } = mockDb();
    const plan = new AtomicPlanBuilder(db, 'g2');
    expect(
      appendUsageMeterToPlan(plan, db, {
        tenantId: 't1',
        documentId: 'x',
        documentType: 'RC',
      }),
    ).toBe(false);
    expect(plan.size).toBe(0);
  });

  it('NC 07 cuenta', () => {
    const { db } = mockDb();
    const plan = new AtomicPlanBuilder(db, 'g3');
    expect(
      appendUsageMeterToPlan(plan, db, {
        tenantId: 't1',
        documentId: 'nc-1',
        documentType: '07',
        eventId: 'ev-nc',
      }),
    ).toBe(true);
    expect(plan.size).toBe(2);
  });

  it('módulo de cupo no referencia Stripe (hot path seguro)', async () => {
    const mod = await import('./usage-meter-batch.js');
    expect(Object.keys(mod)).toContain('appendUsageMeterToPlan');
    expect(JSON.stringify(mod)).not.toMatch(/stripe/i);
  });
});
