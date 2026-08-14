import { describe, expect, it, vi } from 'vitest';
import {
  isSalesCommissionsEnabled,
  runCreateCommissionPayoutHttp,
  runListCommissionRatesHttp,
  runOwnerCommissionsHttp,
  runPayCommissionPayoutHttp,
  runUpsertCommissionRateHttp,
  runVoidCommissionPayoutHttp,
} from './commission-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  listCommissionRates: vi.fn(() =>
    Promise.resolve([
      {
        id: 'r1',
        sellerId: 'u-seller',
        productId: null,
        categoryId: null,
        ratePercent: 5,
        rateAmountCents: null,
      },
    ]),
  ),
  listOwnerCommissions: vi.fn(() =>
    Promise.resolve({
      pendingAccrualCents: 500,
      openPayoutCents: 0,
      paidPayoutCents: 0,
      items: [],
    }),
  ),
  processCommissionRateUpsertAtomic: vi.fn(() => Promise.resolve({ rateId: 'r1' })),
  processCommissionPayoutAtomic: vi.fn(() =>
    Promise.resolve({ payoutId: 'p1', grossCents: 500, status: 'OPEN' }),
  ),
  processCommissionPayoutPayAtomic: vi.fn(() =>
    Promise.resolve({ payoutId: 'p1', status: 'PAID', grossCents: 500 }),
  ),
  processCommissionPayoutVoidAtomic: vi.fn(() =>
    Promise.resolve({ payoutId: 'p1', status: 'VOID' }),
  ),
}));

function env(over: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_SALES_COMMISSIONS: '1',
    DB: {
      prepare() {
        const stmt = {
          bind() {
            return stmt;
          },
          first: () => Promise.resolve(null),
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
    },
    ...over,
  } as unknown as WorkerEnv;
}

describe('commission-routes', () => {
  it('default off', () => {
    expect(isSalesCommissionsEnabled({} as unknown as WorkerEnv)).toBe(false);
  });

  it('404 when flag off', async () => {
    const off = { FEATURE_SALES_COMMISSIONS: '0' } as unknown as WorkerEnv;
    expect((await runListCommissionRatesHttp(off, 't1', 'admin')).status).toBe(404);
    expect((await runUpsertCommissionRateHttp(off, 't1', 'u1', 'admin', {})).status).toBe(404);
    expect((await runCreateCommissionPayoutHttp(off, 't1', 'u1', 'admin', {})).status).toBe(404);
    expect((await runPayCommissionPayoutHttp(off, 't1', 'u1', 'admin', {})).status).toBe(404);
    expect((await runVoidCommissionPayoutHttp(off, 't1', 'u1', 'admin', {})).status).toBe(404);
    expect((await runOwnerCommissionsHttp(off, 't1', 'owner')).status).toBe(404);
  });

  it('T-1: reporte Dueño con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runOwnerCommissionsHttp(env(), 't1', 'cashier');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('rates/payouts require Admin/Owner; owner summary 200', async () => {
    const forbidden = await runUpsertCommissionRateHttp(env(), 't1', 'u1', 'cashier', {
      sellerId: 's1',
      branchId: 'b1',
      ratePercent: 5,
    });
    expect(forbidden.status).toBe(403);

    const upsert = await runUpsertCommissionRateHttp(env(), 't1', 'u1', 'admin', {
      sellerId: 's1',
      branchId: 'b1',
      ratePercent: 5,
    });
    expect(upsert.status).toBe(200);

    const list = await runListCommissionRatesHttp(env(), 't1', 'owner');
    expect(list.status).toBe(200);

    const payout = await runCreateCommissionPayoutHttp(env(), 't1', 'u1', 'owner', {
      sellerId: 's1',
      branchId: 'b1',
      periodStartIso: '2026-08-01',
      periodEndIso: '2026-08-31',
    });
    expect(payout.status).toBe(200);

    const pay = await runPayCommissionPayoutHttp(env(), 't1', 'u1', 'admin', {
      payoutId: 'p1',
      branchId: 'b1',
    });
    expect(pay.status).toBe(200);

    const voided = await runVoidCommissionPayoutHttp(env(), 't1', 'u1', 'admin', {
      payoutId: 'p1',
      branchId: 'b1',
    });
    expect(voided.status).toBe(200);

    const owner = await runOwnerCommissionsHttp(env(), 't1', 'owner');
    expect(owner.status).toBe(200);
    expect((owner.body as { pendingAccrualCents: number }).pendingAccrualCents).toBe(500);
  });
});
