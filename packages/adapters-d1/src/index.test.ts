import { describe, expect, it, vi } from 'vitest';
import {
  isD1Success,
  resolveShardId,
  runBatch,
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
