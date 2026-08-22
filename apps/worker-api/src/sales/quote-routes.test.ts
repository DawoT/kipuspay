import { describe, expect, it, vi } from 'vitest';
import {
  isSalesQuotesEnabled,
  runApproveQuoteHttp,
  runCancelQuoteHttp,
  runConvertQuoteHttp,
  runCreateQuoteHttp,
  runListExpiredQuotesHttp,
  runSendQuoteHttp,
} from './quote-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  processQuoteCreateAtomic: vi.fn(() =>
    Promise.resolve({
      quoteId: 'q1',
      snapshotTotalCents: 1180,
      emitsFiscalDocument: false,
      reservesStock: false,
    }),
  ),
  processQuoteSendAtomic: vi.fn(() =>
    Promise.resolve({ quoteId: 'q1', status: 'SENT', emitsFiscalDocument: false }),
  ),
  processQuoteApproveAtomic: vi.fn(() =>
    Promise.resolve({ quoteId: 'q1', status: 'APPROVED', emitsFiscalDocument: false }),
  ),
  processQuoteConvertAtomic: vi.fn(() => Promise.resolve({ saleId: 's1', quoteId: 'q1' })),
  processQuoteCancelAtomic: vi.fn(() =>
    Promise.resolve({ quoteId: 'q1', status: 'CANCELLED', emitsFiscalDocument: false }),
  ),
}));

function env(over: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_SALES_QUOTES: '1',
    DB: {
      prepare() {
        const stmt = {
          bind() {
            return stmt;
          },
          first: () => Promise.resolve(null),
          all: () =>
            Promise.resolve({
              results: [
                {
                  id: 'q1',
                  branch_id: 'b1',
                  status: 'APPROVED',
                  valid_until: '2020-01-01',
                  total_cents: 1180,
                },
              ],
              success: true,
              meta: {},
            }),
          run: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
      batch: () => Promise.resolve([]),
    },
    ...over,
  } as unknown as WorkerEnv;
}

describe('quote routes', () => {
  it('default off', () => {
    expect(isSalesQuotesEnabled({} as unknown as WorkerEnv)).toBe(false);
  });

  it('404 when flag off', async () => {
    const res = await runCreateQuoteHttp(
      { FEATURE_SALES_QUOTES: '0' } as unknown as WorkerEnv,
      't1',
      'u1',
      {},
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('creates quote without inventing prices from client', async () => {
    const res = await runCreateQuoteHttp(env(), 't1', 'u1', {
      branchId: 'b1',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.emitsFiscalDocument).toBe(false);
    expect(res.body.reservesStock).toBe(false);
  });

  it('US-04: enteredQuantityMicrounits de tipo inválido → 400 estable sin tocar el adapter', async () => {
    const { processQuoteCreateAtomic } = await import('@kipuspay/adapters-d1');
    const callsBefore = vi.mocked(processQuoteCreateAtomic).mock.calls.length;
    for (const bad of ['1000000', true, null, [1_000_000], {}, 1.5]) {
      const res = await runCreateQuoteHttp(env(), 't1', 'u1', {
        branchId: 'b1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: bad as unknown as number }],
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'invalid quantity microunits',
        code: 'INVALID_QUANTITY_MICROUNITS',
      });
    }
    expect(vi.mocked(processQuoteCreateAtomic).mock.calls.length).toBe(callsBefore);
  });

  it('US-04: microunits enteros grandes siguen fluyendo al adapter sin NaN', async () => {
    const { processQuoteCreateAtomic } = await import('@kipuspay/adapters-d1');
    const res = await runCreateQuoteHttp(env(), 't1', 'u1', {
      branchId: 'b1',
      items: [
        { productId: 'p1', enteredQuantityMicrounits: 9_007_199_254_740_991 },
        { productId: 'p2', uomId: 'u1', batchId: null, enteredQuantityMicrounits: 0 },
      ],
    });
    expect(res.status).toBe(200);
    const items = vi.mocked(processQuoteCreateAtomic).mock.calls.at(-1)?.[3]?.items as [
      { enteredQuantityMicrounits: number },
      { enteredQuantityMicrounits: number },
    ];
    expect(items[0]?.enteredQuantityMicrounits).toBe(9_007_199_254_740_991);
    expect(items[1]?.enteredQuantityMicrounits).toBe(0);
  });

  it('lists expired for owner', async () => {
    const res = await runListExpiredQuotesHttp(env(), 't1', 'owner');
    expect(res.status).toBe(200);
    expect((res.body.items as { status: string }[])[0]?.status).toBe('EXPIRED');
  });

  it('requires reason to cancel', async () => {
    const res = await runCancelQuoteHttp(env(), 't1', 'u1', { quoteId: 'q1' });
    expect(res.status).toBe(400);
  });

  it('503 without DB and 401 without tenant', async () => {
    const noDb = await runCreateQuoteHttp(
      { FEATURE_SALES_QUOTES: '1' } as unknown as WorkerEnv,
      't1',
      'u1',
      { branchId: 'b1', items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }] },
    );
    expect(noDb.status).toBe(503);
    const noTenant = await runCreateQuoteHttp(env(), '', 'u1', {
      branchId: 'b1',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
    });
    expect(noTenant.status).toBe(401);
    const bad = await runCreateQuoteHttp(env(), 't1', 'u1', { branchId: 'b1' });
    expect(bad.status).toBe(400);
  });

  it('send, approve, convert and cancel', async () => {
    const send = await runSendQuoteHttp(env(), 't1', 'u1', { quoteId: 'q1' });
    expect(send.status).toBe(200);
    expect(send.body.status).toBe('SENT');
    const approve = await runApproveQuoteHttp(env(), 't1', 'u1', 'owner', { quoteId: 'q1' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('APPROVED');
    const convert = await runConvertQuoteHttp(env(), 't1', 'u1', 'owner', {
      quoteId: 'q1',
      cashRegisterSessionId: 's1',
      series: 'NV01',
      documentType: 'NV',
    });
    expect(convert.status).toBe(200);
    expect(convert.body.saleId).toBe('s1');
    const cancel = await runCancelQuoteHttp(env(), 't1', 'u1', {
      quoteId: 'q1',
      reason: 'cliente desiste',
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('maps domain errors to 404/422', async () => {
    const { processQuoteSendAtomic, processQuoteConvertAtomic } =
      await import('@kipuspay/adapters-d1');
    vi.mocked(processQuoteSendAtomic).mockRejectedValueOnce(new Error('QUOTE_NOT_FOUND'));
    const missing = await runSendQuoteHttp(env(), 't1', 'u1', { quoteId: 'missing' });
    expect(missing.status).toBe(404);
    vi.mocked(processQuoteConvertAtomic).mockRejectedValueOnce(new Error('QUOTE_EXPIRED'));
    const expired = await runConvertQuoteHttp(env(), 't1', 'u1', 'owner', {
      quoteId: 'q1',
      cashRegisterSessionId: 's1',
      series: 'NV01',
    });
    expect(expired.status).toBe(422);
    const sendBad = await runSendQuoteHttp(env(), 't1', 'u1', {});
    expect(sendBad.status).toBe(400);
    const convertBad = await runConvertQuoteHttp(env(), 't1', 'u1', 'owner', { quoteId: 'q1' });
    expect(convertBad.status).toBe(400);
  });

  it('S33-H1: approve con cashier → 403; convert con cashier → 403', async () => {
    const approve = await runApproveQuoteHttp(env(), 't1', 'u1', 'cashier', { quoteId: 'q1' });
    expect(approve.status).toBe(403);
    expect(approve.body.code).toBe('FORBIDDEN_ROLE');
    const convert = await runConvertQuoteHttp(env(), 't1', 'u1', 'cashier', {
      quoteId: 'q1',
      cashRegisterSessionId: 's1',
      series: 'NV01',
    });
    expect(convert.status).toBe(403);
    expect(convert.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('T-1: reporte Dueño con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runListExpiredQuotesHttp(env(), 't1', 'cashier');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('expired list flag off / no DB', async () => {
    const off = await runListExpiredQuotesHttp(
      { FEATURE_SALES_QUOTES: '0' } as unknown as WorkerEnv,
      't1',
    );
    expect(off.status).toBe(404);
    const noDb = await runListExpiredQuotesHttp(
      { FEATURE_SALES_QUOTES: '1' } as unknown as WorkerEnv,
      't1',
    );
    expect(noDb.status).toBe(503);
  });
});
