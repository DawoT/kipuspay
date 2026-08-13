import { describe, expect, it, vi } from 'vitest';
import {
  isSalesReturnsEnabled,
  runCreateSalesReturnHttp,
  runGetReturnPolicyHttp,
  runUpsertReturnPolicyHttp,
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

  it('S28-H3: PUT policy sin rol admin/owner → 403 FORBIDDEN_ROLE', async () => {
    const res = await runUpsertReturnPolicyHttp(
      { FEATURE_SALES_RETURNS: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      'u1',
      'cashier',
      { windowDays: 14 },
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('S28-H3: PUT policy admin crea fila + audita RETURN_POLICY_UPDATE', async () => {
    const sqls: string[] = [];
    const first = vi.fn().mockResolvedValue(null);
    const run = vi.fn(async (sql: string, ...args: unknown[]) => {
      sqls.push(sql);
      return { success: true };
    });
    const env = {
      FEATURE_SALES_RETURNS: '1',
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: unknown[]) => ({
            first: () => first(sql, ...args),
            run: () => run(sql, ...args),
          }),
        }),
      },
    } as unknown as WorkerEnv;
    const res = await runUpsertReturnPolicyHttp(env, 't1', 'u1', 'owner', {
      windowDays: 14,
      refundToOriginalMethod: false,
      allowTurnClosedWithAuth: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(14);
    expect(res.body.refundToOriginalMethod).toBe(false);
    const inserts = sqls.filter((s) => s.includes('INSERT INTO return_policies'));
    expect(inserts.length).toBe(1);
    const audits = sqls.filter((s) => s.includes('RETURN_POLICY_UPDATE'));
    expect(audits.length).toBe(1);
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
