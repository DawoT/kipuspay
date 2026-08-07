import { describe, expect, it, vi } from 'vitest';
import {
  isSalesReturnsEnabled,
  runCreateSalesReturnHttp,
  runGetReturnPolicyHttp,
} from './sales-returns-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

describe('sales-returns-routes', () => {
  it('flag off → FEATURE_OFF', async () => {
    expect(isSalesReturnsEnabled({ FEATURE_SALES_RETURNS: '0' } as WorkerEnv)).toBe(false);
    expect(isSalesReturnsEnabled({ FEATURE_SALES_RETURNS: '1' } as WorkerEnv)).toBe(true);
    const res = await runCreateSalesReturnHttp(
      { FEATURE_SALES_RETURNS: '0' } as WorkerEnv,
      't1',
      'u1',
      {
        originSaleId: 's1',
        series: 'NVR1',
        reason: 'x',
        lines: [{ originalSaleItemId: 'i1', qty: 1 }],
      },
    );
    expect(res).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('flag on sin DB → 503', async () => {
    const res = await runCreateSalesReturnHttp(
      { FEATURE_SALES_RETURNS: '1' } as WorkerEnv,
      't1',
      'u1',
      {
        originSaleId: 's1',
        series: 'NVR1',
        reason: 'x',
        lines: [{ originalSaleItemId: 'i1', qty: 1 }],
      },
    );
    expect(res.status).toBe(503);
  });

  it('flag on body incompleto → 400', async () => {
    const res = await runCreateSalesReturnHttp(
      { FEATURE_SALES_RETURNS: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      'u1',
      {},
    );
    expect(res.status).toBe(400);
  });

  it('policy GET flag off → 404; on → 200 default', async () => {
    const off = await runGetReturnPolicyHttp({ FEATURE_SALES_RETURNS: '0' } as WorkerEnv, 't1');
    expect(off.status).toBe(404);

    const first = vi.fn().mockResolvedValue(null);
    const env = {
      FEATURE_SALES_RETURNS: '1',
      DB: {
        prepare: () => ({
          bind: () => ({ first }),
        }),
      },
    } as unknown as WorkerEnv;
    const on = await runGetReturnPolicyHttp(env, 't1');
    expect(on.status).toBe(200);
    expect(on.body.windowDays).toBe(7);
  });
});
