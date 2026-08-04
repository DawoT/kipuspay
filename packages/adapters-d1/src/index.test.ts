import { describe, expect, it, vi } from 'vitest';
import {
  AtomicPlanBuilder,
  isD1Success,
  resolveShardId,
  runBatch,
  runD1AtomicPlan,
  type D1Bound,
  type D1DatabaseLike,
  type D1Result,
} from './index.js';

describe('isD1Success', () => {
  it('true con D1Result.success', () => {
    const result: D1Result<unknown> = { results: [], success: true, meta: {} };
    expect(isD1Success(result)).toBe(true);
  });

  it('false cuando D1 falla', () => {
    const result: D1Result<unknown> = { results: [], success: false, meta: {} };
    expect(isD1Success(result)).toBe(false);
  });
});

describe('resolveShardId', () => {
  it('devuelve el shard declarado', () => {
    expect(resolveShardId('shard-pe-1')).toBe('shard-pe-1');
  });

  it('rechaza tenant sin shard', () => {
    expect(() => resolveShardId(null)).toThrow(/sin shard_id/);
    expect(() => resolveShardId('')).toThrow(/sin shard_id/);
  });
});

describe('runBatch', () => {
  it('delega en db.batch', async () => {
    const statements = [{} as D1Bound];
    const batch = vi.fn().mockResolvedValue([{ success: true, results: [], meta: {} }]);
    const db = { batch, prepare: vi.fn() } as unknown as D1DatabaseLike;
    const out = await runBatch(db, statements);
    expect(batch).toHaveBeenCalledWith(statements);
    expect(out[0]?.success).toBe(true);
  });
});

describe('runD1AtomicPlan / AtomicPlanBuilder', () => {
  function fakeDb(batchImpl?: ReturnType<typeof vi.fn>) {
    const prepared: D1Bound[] = [];
    const batch =
      batchImpl ??
      vi
        .fn()
        .mockImplementation((stmts: D1Bound[]) =>
          Promise.resolve(stmts.map(() => ({ success: true, results: [], meta: {} }))),
        );
    const db = {
      batch,
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          void args;
          const bound = { sql } as unknown as D1Bound;
          prepared.push(bound);
          return bound;
        },
      }),
    } as unknown as D1DatabaseLike;
    return { db, batch, prepared };
  }

  it('envuelve statements con INSERT/DELETE atomic_guards', async () => {
    const { db, batch } = fakeDb();
    await runD1AtomicPlan(
      db,
      (plan) => {
        plan.add(db.prepare('UPDATE t SET x=1').bind());
      },
      { guardId: 'g1' },
    );

    expect(batch).toHaveBeenCalledTimes(1);
    const stmts = batch.mock.calls[0]![0] as Array<{ sql: string }>;
    expect(stmts).toHaveLength(3);
    expect(stmts[0]!.sql).toMatch(/INSERT INTO atomic_guards/);
    expect(stmts[1]!.sql).toMatch(/UPDATE t/);
    expect(stmts[2]!.sql).toMatch(/DELETE FROM atomic_guards/);
  });

  it('ok=false sigue emitiendo el plan (D1 aborta por CHECK en runtime)', async () => {
    const { db, batch } = fakeDb();
    const plan = new AtomicPlanBuilder(db, 'g-fail');
    plan.add(db.prepare('INSERT INTO t VALUES (1)').bind());
    await plan.commit(false);
    const stmts = batch.mock.calls[0]![0] as Array<{ sql: string }>;
    expect(stmts[0]!.sql).toMatch(/INSERT INTO atomic_guards/);
  });
});
