import { describe, expect, it, vi } from 'vitest';
import {
  closedLimaWindow,
  parseActiveShards,
  runDailyRollupsCron,
  runRollupsForShard,
  type ShardBinding,
} from './daily-rollups-cron.js';
import type { D1DatabaseLike } from './index.js';
import { rematerializeDailyRollup } from './rollup-rematerialize.js';

vi.mock('./rollup-rematerialize.js', () => ({
  rematerializeDailyRollup: vi.fn(async () => ({
    rematerialized: true,
    reportDate: '2026-08-04',
    grossSalesCents: 100,
    docCount: 1,
    productRowCount: 1,
  })),
}));

describe('daily-rollups-cron puro', () => {
  it('closedLimaWindow: día Lima anterior a scheduledTime', () => {
    // 2026-08-05 08:00 UTC = 2026-08-05 03:00 Lima → closed = 2026-08-04
    const w = closedLimaWindow(Date.parse('2026-08-05T08:00:00.000Z'));
    expect(w.reportDateLima).toBe('2026-08-04');
    expect(w.startOfLimaDay).toBe('2026-08-04 00:00:00');
  });

  it('parseActiveShards default y JSON', () => {
    expect(parseActiveShards(null)).toEqual(['D1_SHARD_01']);
    expect(parseActiveShards('["A","B"]')).toEqual(['A', 'B']);
    expect(parseActiveShards('not-json')).toEqual(['D1_SHARD_01']);
  });

  it('Promise.all fan-out no bloquea shards (pares vacíos)', async () => {
    const emptyDb = {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ success: true }),
        }),
      }),
      batch: () => Promise.resolve([]),
    } as unknown as D1DatabaseLike;
    const started: string[] = [];
    const shards: ShardBinding[] = [
      {
        shardKey: 'slow',
        db: {
          ...emptyDb,
          prepare: () => ({
            bind: () => ({
              all: async () => {
                started.push('slow');
                await new Promise((r) => setTimeout(r, 20));
                return { results: [] };
              },
              first: () => Promise.resolve(null),
              run: () => Promise.resolve({ success: true }),
            }),
          }),
        } as unknown as D1DatabaseLike,
      },
      {
        shardKey: 'fast',
        db: {
          ...emptyDb,
          prepare: () => ({
            bind: () => ({
              all: () => {
                started.push('fast');
                return Promise.resolve({ results: [] });
              },
              first: () => Promise.resolve(null),
              run: () => Promise.resolve({ success: true }),
            }),
          }),
        } as unknown as D1DatabaseLike,
      },
    ];
    const result = await runDailyRollupsCron(shards, Date.parse('2026-08-05T08:00:00.000Z'));
    expect(result.shards).toHaveLength(2);
    expect(started).toContain('fast');
    expect(started).toContain('slow');
    // fast arranca sin esperar a slow (Promise.all)
    expect(started.indexOf('fast')).toBeLessThan(started.indexOf('slow') + 2);
    vi.clearAllTimers();
  });

  it('omite product rollups cuando el tenant no tiene la capability', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [{ tenant_id: 't1', branch_id: 'b1' }] }),
        }),
      }),
    } as unknown as D1DatabaseLike;

    await runRollupsForShard(
      { shardKey: 'D1_SHARD_01', db },
      '2026-08-04',
      undefined,
      new Set(['t1']),
      new Set(),
    );

    expect(vi.mocked(rematerializeDailyRollup)).toHaveBeenCalledWith(
      db,
      't1',
      'b1',
      '2026-08-04',
      undefined,
      { includeProductRollups: false },
    );
  });
});
