import { describe, expect, it } from 'vitest';
import {
  createMemoryOwnerRollupIdb,
  formatStaleBanner,
  loadOwnerDayView,
  readCachedRollup,
  writeCachedRollup,
} from './cache.js';

describe('owner.offline_rollup', () => {
  it('banner nunca dice en vivo', () => {
    expect(formatStaleBanner(0, 3_600_000)).toContain('1 horas');
    expect(formatStaleBanner(0, 3_600_000)).toContain('no en vivo');
    expect(formatStaleBanner(0, 120_000)).toContain('2 min');
  });

  it('offline lee cache; online refresca', async () => {
    const idb = createMemoryOwnerRollupIdb();
    await writeCachedRollup(idb, {
      tenantId: 't1',
      branchId: 'b1',
      reportDate: '2026-08-04',
      grossSalesCents: 1000,
      netSalesCents: 900,
      docCount: 2,
      cachedAtMs: 1_000,
    });
    const offline = await loadOwnerDayView(
      {
        idb,
        online: false,
        nowMs: 1_000 + 7_200_000,
        fetchDaySummary: () => Promise.reject(new Error('should not fetch')),
      },
      't1',
      'b1',
      '2026-08-04',
    );
    expect(offline.fromCache).toBe(true);
    expect(offline.snapshot?.netSalesCents).toBe(900);
    expect(offline.banner).toContain('2 horas');

    const online = await loadOwnerDayView(
      {
        idb,
        online: true,
        nowMs: 9_000_000,
        fetchDaySummary: () =>
          Promise.resolve({
            totals: { grossSalesCents: 5000, netSalesCents: 4800, docCount: 10 },
            branches: [{ branch_id: 'b1' }],
          }),
      },
      't1',
      'b1',
      '2026-08-04',
    );
    expect(online.fromCache).toBe(false);
    expect(online.snapshot?.netSalesCents).toBe(4800);
    const cached = await readCachedRollup(idb, 't1', 'b1', '2026-08-04');
    expect(cached?.netSalesCents).toBe(4800);
  });
});
