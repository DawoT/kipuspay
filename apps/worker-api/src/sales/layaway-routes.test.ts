import { describe, expect, it, vi } from 'vitest';
import {
  isSalesLayawayEnabled,
  runCancelLayawayHttp,
  runConvertLayawayHttp,
  runCreateLayawayHttp,
  runDepositLayawayHttp,
  runListOverdueLayawaysHttp,
} from './layaway-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  processLayawayCreateAtomic: vi.fn(() =>
    Promise.resolve({
      depositId: 'd1',
      snapshotTotalCents: 1180,
      emitsFiscalDocument: false,
    }),
  ),
  processLayawayDepositAtomic: vi.fn(() =>
    Promise.resolve({
      paymentId: 'p1',
      balanceAfterCents: 0,
      emitsFiscalDocument: false,
    }),
  ),
  processLayawayConvertAtomic: vi.fn(() => Promise.resolve({ saleId: 's1', depositId: 'd1' })),
  processLayawayCancelAtomic: vi.fn(() =>
    Promise.resolve({ refundCents: 500, status: 'CANCELLED' }),
  ),
}));

function env(over: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_SALES_LAYAWAY: '1',
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
                  id: 'd1',
                  branch_id: 'b1',
                  status: 'OPEN',
                  due_date: '2020-01-01',
                  snapshot_total_cents: 1000,
                  paid_cents: 200,
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

describe('layaway routes', () => {
  it('default off', () => {
    expect(isSalesLayawayEnabled({} as unknown as WorkerEnv)).toBe(false);
  });

  it('404 when flag off', async () => {
    const res = await runCreateLayawayHttp(
      { FEATURE_SALES_LAYAWAY: '0' } as unknown as WorkerEnv,
      't1',
      'u1',
      {},
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('creates layaway without inventing prices from client', async () => {
    const res = await runCreateLayawayHttp(env(), 't1', 'u1', {
      branchId: 'b1',
      cashRegisterSessionId: 's1',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.emitsFiscalDocument).toBe(false);
  });

  it('US-04: enteredQuantityMicrounits de tipo inválido → 400 estable sin tocar el adapter', async () => {
    const { processLayawayCreateAtomic } = await import('@kipuspay/adapters-d1');
    const callsBefore = vi.mocked(processLayawayCreateAtomic).mock.calls.length;
    for (const bad of ['1000000', true, null, [1_000_000], {}, NaN]) {
      const res = await runCreateLayawayHttp(env(), 't1', 'u1', {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: bad as unknown as number }],
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'invalid quantity microunits',
        code: 'INVALID_QUANTITY_MICROUNITS',
      });
    }
    expect(vi.mocked(processLayawayCreateAtomic).mock.calls.length).toBe(callsBefore);
  });

  it('lists overdue for owner', async () => {
    const res = await runListOverdueLayawaysHttp(env(), 't1');
    expect(res.status).toBe(200);
    expect((res.body.items as { status: string }[])[0]?.status).toBe('OVERDUE');
  });

  it('requires reason to cancel', async () => {
    const res = await runCancelLayawayHttp(env(), 't1', 'u1', { depositId: 'd1' });
    expect(res.status).toBe(400);
  });

  it('503 without DB and 401 without tenant', async () => {
    const noDb = await runCreateLayawayHttp(
      { FEATURE_SALES_LAYAWAY: '1' } as unknown as WorkerEnv,
      't1',
      'u1',
      {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
      },
    );
    expect(noDb.status).toBe(503);
    const noTenant = await runCreateLayawayHttp(env(), '', 'u1', {
      branchId: 'b1',
      cashRegisterSessionId: 's1',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
    });
    expect(noTenant.status).toBe(401);
    const bad = await runCreateLayawayHttp(env(), 't1', 'u1', { branchId: 'b1' });
    expect(bad.status).toBe(400);
  });

  it('deposits, converts and cancels without inventing prices', async () => {
    const deposit = await runDepositLayawayHttp(env(), 't1', 'u1', {
      depositId: 'd1',
      cashRegisterSessionId: 's1',
      amountCents: 200,
      paymentMethod: 'cash',
    });
    expect(deposit.status).toBe(200);
    expect(deposit.body.emitsFiscalDocument).toBe(false);
    const convert = await runConvertLayawayHttp(env(), 't1', 'u1', {
      depositId: 'd1',
      cashRegisterSessionId: 's1',
      series: 'NV01',
      documentType: 'NV',
      remainingAsCredit: true,
    });
    expect(convert.status).toBe(200);
    expect(convert.body.saleId).toBe('s1');
    const cancel = await runCancelLayawayHttp(env(), 't1', 'u1', {
      depositId: 'd1',
      reason: 'cliente desiste',
      cashRegisterSessionId: 's1',
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('maps domain errors to 404/422', async () => {
    const { processLayawayDepositAtomic, processLayawayConvertAtomic } =
      await import('@kipuspay/adapters-d1');
    vi.mocked(processLayawayDepositAtomic).mockRejectedValueOnce(new Error('LAYAWAY_NOT_FOUND'));
    const missing = await runDepositLayawayHttp(env(), 't1', 'u1', {
      depositId: 'missing',
      cashRegisterSessionId: 's1',
      amountCents: 100,
    });
    expect(missing.status).toBe(404);
    vi.mocked(processLayawayConvertAtomic).mockRejectedValueOnce(
      new Error('LAYAWAY_INSUFFICIENT_DEPOSIT'),
    );
    const unfunded = await runConvertLayawayHttp(env(), 't1', 'u1', {
      depositId: 'd1',
      cashRegisterSessionId: 's1',
      series: 'NV01',
    });
    expect(unfunded.status).toBe(422);
    const depositBad = await runDepositLayawayHttp(env(), 't1', 'u1', { depositId: 'd1' });
    expect(depositBad.status).toBe(400);
    const convertBad = await runConvertLayawayHttp(env(), 't1', 'u1', { depositId: 'd1' });
    expect(convertBad.status).toBe(400);
  });

  it('overdue list flag off / no DB', async () => {
    const off = await runListOverdueLayawaysHttp(
      { FEATURE_SALES_LAYAWAY: '0' } as unknown as WorkerEnv,
      't1',
    );
    expect(off.status).toBe(404);
    const noDb = await runListOverdueLayawaysHttp(
      { FEATURE_SALES_LAYAWAY: '1' } as unknown as WorkerEnv,
      't1',
    );
    expect(noDb.status).toBe(503);
  });
});
