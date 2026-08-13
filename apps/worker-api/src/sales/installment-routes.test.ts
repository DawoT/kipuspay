import { describe, expect, it, vi } from 'vitest';
import {
  isSalesInstallmentsEnabled,
  runCreateInstallmentPlanHttp,
  runOwnerInstallmentsOverdueHttp,
  runPayInstallmentHttp,
} from './installment-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  processInstallmentPlanAtomic: vi.fn(() =>
    Promise.resolve({
      saleId: 's1',
      installmentIds: ['i1', 'i2'],
      schedulePrincipalCents: 8_000,
    }),
  ),
  processInstallmentPayAtomic: vi.fn(() =>
    Promise.resolve({
      paymentId: 'p1',
      installmentId: 'i1',
      appliedToArCents: 4_000,
      interestCents: 100,
      alreadyPaid: false,
    }),
  ),
  listOverdueInstallments: vi.fn(() =>
    Promise.resolve([
      {
        id: 'i1',
        saleId: 's1',
        installmentNumber: 1,
        amountCents: 4_100,
        dueDate: '2026-07-01',
        status: 'OVERDUE',
      },
    ]),
  ),
}));

function env(over: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_SALES_INSTALLMENTS: '1',
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

describe('installment-routes', () => {
  it('default off', () => {
    expect(isSalesInstallmentsEnabled({} as unknown as WorkerEnv)).toBe(false);
  });

  it('404 when flag off', async () => {
    const off = { FEATURE_SALES_INSTALLMENTS: '0' } as unknown as WorkerEnv;
    expect((await runCreateInstallmentPlanHttp(off, 't1', 'u1', 'admin', {})).status).toBe(404);
    expect((await runPayInstallmentHttp(off, 't1', 'u1', 'admin', {})).status).toBe(404);
    expect((await runOwnerInstallmentsOverdueHttp(off, 't1')).status).toBe(404);
  });


  it('T-1: reporte Dueño con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runOwnerInstallmentsOverdueHttp(env(), 't1', 'cashier');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('create/pay require Supervisor+; owner overdue 200', async () => {
    const forbidden = await runCreateInstallmentPlanHttp(env(), 't1', 'u1', 'cashier', {
      saleId: 's1',
      branchId: 'b1',
      items: [
        {
          installmentNumber: 1,
          principalCents: 8_000,
          interestCents: 0,
          dueDateIso: '2026-09-01',
        },
      ],
    });
    expect(forbidden.status).toBe(403);

    const created = await runCreateInstallmentPlanHttp(env(), 't1', 'u1', 'supervisor', {
      saleId: 's1',
      branchId: 'b1',
      downPaymentCents: 0,
      items: [
        {
          installmentNumber: 1,
          principalCents: 8_000,
          interestCents: 0,
          dueDateIso: '2026-09-01',
        },
      ],
    });
    expect(created.status).toBe(200);
    expect(created.body.schedulePrincipalCents).toBe(8_000);

    const badPay = await runPayInstallmentHttp(env(), 't1', 'u1', 'admin', {
      installmentId: 'i1',
    });
    expect(badPay.status).toBe(400);

    const paid = await runPayInstallmentHttp(env(), 't1', 'u1', 'owner', {
      installmentId: 'i1',
      branchId: 'b1',
      cashRegisterSessionId: 'sess1',
      idempotencyKey: 'idem-1',
      paymentMethod: 'cash',
    });
    expect(paid.status).toBe(200);
    expect(paid.body.appliedToArCents).toBe(4_000);

    const owner = await runOwnerInstallmentsOverdueHttp(env(), 't1', 'owner');
    expect(owner.status).toBe(200);
    expect(Array.isArray(owner.body.items)).toBe(true);
  });

  it('401 without tenant/user; 400 without items', async () => {
    expect((await runCreateInstallmentPlanHttp(env(), '', 'u1', 'admin', {})).status).toBe(401);
    expect(
      (await runCreateInstallmentPlanHttp(env(), 't1', 'u1', 'admin', { saleId: 's1' })).status,
    ).toBe(400);
    expect((await runPayInstallmentHttp(env(), 't1', '', 'admin', {})).status).toBe(401);
    expect((await runOwnerInstallmentsOverdueHttp(env(), '', 'owner')).status).toBe(401);
  });
});
