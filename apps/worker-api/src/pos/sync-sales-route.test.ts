import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isOfflineSyncEnabled, runSyncSalesHttp } from './sync-sales-route.js';

describe('sync-sales-route flags', () => {
  it('FEATURE_OFFLINE_SYNC default off', () => {
    expect(isOfflineSyncEnabled({} as WorkerEnv)).toBe(false);
    expect(isOfflineSyncEnabled({ FEATURE_OFFLINE_SYNC: '0' } as WorkerEnv)).toBe(false);
    expect(isOfflineSyncEnabled({ FEATURE_OFFLINE_SYNC: '1' } as WorkerEnv)).toBe(true);
  });

  it('flag off → 404', async () => {
    const res = await runSyncSalesHttp({ FEATURE_OFFLINE_SYNC: '0' } as WorkerEnv, 't1', 'u1', {
      sales: [],
    });
    expect(res.status).toBe(404);
  });

  it('flag on sin DB → 503; sales vacío → 400', async () => {
    const noDb = await runSyncSalesHttp({ FEATURE_OFFLINE_SYNC: '1' } as WorkerEnv, 't1', 'u1', {
      sales: [{ offlineSaleId: 'x' } as never],
    });
    expect(noDb.status).toBe(503);

    const empty = await runSyncSalesHttp(
      { FEATURE_OFFLINE_SYNC: 'true', DB: {} as WorkerEnv['DB'] } as WorkerEnv,
      't1',
      'u1',
      { sales: [] },
    );
    expect(empty.status).toBe(400);
  });
});
