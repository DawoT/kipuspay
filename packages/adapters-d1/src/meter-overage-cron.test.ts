import { describe, expect, it, vi } from 'vitest';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';
import { runMeterOverageCron } from './meter-overage-cron.js';

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(opts: {
  counters?: Array<{
    tenant_id: string;
    period_ym: string;
    doc_count: number;
    overage_reported_thru: number;
    plan_id: string | null;
    stripe_customer_id: string | null;
  }>;
  existingKey?: boolean;
  insertFail?: boolean;
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM billing_overages')) {
            return Promise.resolve((opts.existingKey ? { id: 'bo-1' } : null) as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult((opts.counters ?? []) as unknown as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => {
      if (opts.insertFail) {
        return Promise.reject(new Error('UNIQUE constraint failed'));
      }
      return Promise.resolve(stmts.map(() => okResult()));
    },
  };
}

describe('runMeterOverageCron', () => {
  const nowMs = Date.UTC(2026, 7, 7, 17, 0, 0); // Lima 2026-08-07

  it('reporta sobregiro y avanza overage_reported_thru', async () => {
    const reportFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      idempotentReplay: false,
      bodyText: '{}',
    });
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't1',
            period_ym: '2026-08',
            doc_count: 1005,
            overage_reported_thru: 1000,
            plan_id: 'arranque',
            stripe_customer_id: 'cus_1',
          },
        ],
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn,
    });
    expect(res.reported).toBe(1);
    expect(res.unitsTotal).toBe(5);
    expect(reportFn).toHaveBeenCalledOnce();
  });

  it('doble cron mismo día: segunda pasada skippedIdempotent', async () => {
    const reportFn = vi.fn();
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't1',
            period_ym: '2026-08',
            doc_count: 1010,
            overage_reported_thru: 1000,
            plan_id: 'arranque',
            stripe_customer_id: 'cus_1',
          },
        ],
        existingKey: true,
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn,
    });
    expect(res.skippedIdempotent).toBe(1);
    expect(res.reported).toBe(0);
    expect(reportFn).not.toHaveBeenCalled();
  });

  it('sin stripe customer → error sin cobrar', async () => {
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't2',
            period_ym: '2026-08',
            doc_count: 1001,
            overage_reported_thru: 0,
            plan_id: 'arranque',
            stripe_customer_id: null,
          },
        ],
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn: vi.fn(),
    });
    expect(res.errors.some((e) => e.includes('missing_stripe_customer'))).toBe(true);
    expect(res.reported).toBe(0);
  });

  it('units bajo cupo → no reporta', async () => {
    const reportFn = vi.fn();
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't3',
            period_ym: '2026-08',
            doc_count: 50,
            overage_reported_thru: 0,
            plan_id: null,
            stripe_customer_id: 'cus_3',
          },
        ],
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn,
    });
    expect(res.reported).toBe(0);
    expect(reportFn).not.toHaveBeenCalled();
  });

  it('stripe HTTP fail → error', async () => {
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't4',
            period_ym: '2026-08',
            doc_count: 1002,
            overage_reported_thru: 1000,
            plan_id: 'arranque',
            stripe_customer_id: 'cus_4',
          },
        ],
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn: vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        idempotentReplay: false,
        bodyText: 'err',
      }),
    });
    expect(res.errors.some((e) => e.includes('stripe_500'))).toBe(true);
  });

  it('reportFn throw → error', async () => {
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't5',
            period_ym: '2026-08',
            doc_count: 1002,
            overage_reported_thru: 1000,
            plan_id: 'arranque',
            stripe_customer_id: 'cus_5',
          },
        ],
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn: vi.fn().mockRejectedValue(new Error('STRIPE_SECRET_KEY missing')),
    });
    expect(res.errors.some((e) => e.includes('STRIPE_SECRET_KEY'))).toBe(true);
  });

  it('UNIQUE en insert → skippedIdempotent', async () => {
    const res = await runMeterOverageCron({
      db: mockDb({
        counters: [
          {
            tenant_id: 't6',
            period_ym: '2026-08',
            doc_count: 1002,
            overage_reported_thru: 1000,
            plan_id: 'arranque',
            stripe_customer_id: 'cus_6',
          },
        ],
        insertFail: true,
      }),
      stripeApiKey: 'sk_test',
      nowMs,
      reportFn: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        idempotentReplay: false,
        bodyText: '{}',
      }),
    });
    expect(res.skippedIdempotent).toBe(1);
  });
});
