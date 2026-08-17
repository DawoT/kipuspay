import { describe, expect, it } from 'vitest';
import {
  isCashExpensesEnabled,
  isLedgerArApEnabled,
  isOwnerModeEnabled,
  isPurchasingOrdersEnabled,
  runCreateApHttp,
  runCreateExpenseHttp,
  runCreatePoHttp,
  runListApHttp,
  runListArHttp,
  runOwnerDaySummaryHttp,
  runPayApHttp,
  runPayArHttp,
  runTransitionPoHttp,
} from './ledger-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

type Row = Record<string, unknown>;

function mockEnv(
  flags: Record<string, string>,
  opts?: {
    first?: Row | null;
    all?: Row[];
  },
): WorkerEnv {
  const first = opts?.first ?? null;
  const all = opts?.all ?? [];
  const bound = {
    first: () => Promise.resolve(first),
    all: () => Promise.resolve({ results: all }),
    run: () => Promise.resolve({ success: true, results: [], meta: {} }),
  };
  const db = {
    prepare: () => ({
      bind: () => bound,
    }),
    batch: (stmts: Array<{ run: () => Promise<unknown> }>) =>
      Promise.all(stmts.map((s) => s.run())),
  };
  return {
    ...flags,
    DB: db as unknown as WorkerEnv['DB'],
  } as WorkerEnv;
}

describe('ledger / owner flags', () => {
  it('default off', () => {
    expect(isLedgerArApEnabled({} as WorkerEnv)).toBe(false);
    expect(isPurchasingOrdersEnabled({ FEATURE_PURCHASING_ORDERS: '0' } as WorkerEnv)).toBe(false);
    expect(isCashExpensesEnabled({ FEATURE_CASH_EXPENSES: '1' } as WorkerEnv)).toBe(true);
    expect(isOwnerModeEnabled({ FEATURE_OWNER_MODE: 'true' } as WorkerEnv)).toBe(true);
  });

  it('list AR/AP flag off → 404 FEATURE_OFF', async () => {
    const ar = await runListArHttp({ FEATURE_LEDGER_AR_AP: '0' } as WorkerEnv, 't1');
    expect(ar.status).toBe(404);
    expect(ar.body.code).toBe('FEATURE_OFF');
    const ap = await runListApHttp({ FEATURE_LEDGER_AR_AP: '0' } as WorkerEnv, 't1');
    expect(ap.status).toBe(404);
  });

  it('list AR/AP sin DB → 503; con DB → 200', async () => {
    expect((await runListArHttp({ FEATURE_LEDGER_AR_AP: '1' } as WorkerEnv, 't1')).status).toBe(
      503,
    );
    const ok = await runListArHttp(
      mockEnv({ FEATURE_LEDGER_AR_AP: '1' }, { all: [{ id: 'ar1' }] }),
      't1',
    );
    expect(ok.status).toBe(200);
    expect((ok.body.items as unknown[]).length).toBe(1);
    const apOk = await runListApHttp(mockEnv({ FEATURE_LEDGER_AR_AP: '1' }), 't1');
    expect(apOk.status).toBe(200);
  });

  it('pay AR happy + rechazo exceso + not found', async () => {
    const bad = await runPayArHttp(mockEnv({ FEATURE_LEDGER_AR_AP: '1' }), 't1', 'u1', {});
    expect(bad.status).toBe(400);

    const missing = await runPayArHttp(
      mockEnv({ FEATURE_LEDGER_AR_AP: '1' }, { first: null }),
      't1',
      'u1',
      { accountsReceivableId: 'ar1', amountCents: 100 },
    );
    expect(missing.status).toBe(404);

    const over = await runPayArHttp(
      mockEnv({ FEATURE_LEDGER_AR_AP: '1' }, { first: { id: 'ar1', balance_due_cents: 50 } }),
      't1',
      'u1',
      { accountsReceivableId: 'ar1', amountCents: 100 },
    );
    expect(over.status).toBe(422);

    const ok = await runPayArHttp(
      mockEnv({ FEATURE_LEDGER_AR_AP: '1' }, { first: { id: 'ar1', balance_due_cents: 500 } }),
      't1',
      'u1',
      {
        accountsReceivableId: 'ar1',
        amountCents: 200,
        paymentMethod: 'cash',
        cashRegisterSessionId: 's1',
      },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.nextBalanceCents).toBe(300);
  });

  it('pay AP + create AP', async () => {
    const pay = await runPayApHttp(
      mockEnv({ FEATURE_LEDGER_AR_AP: '1' }, { first: { id: 'ap1', balance_due_cents: 1000 } }),
      't1',
      { accountsPayableId: 'ap1', amountCents: 1000, paymentMethod: 'transfer' },
    );
    expect(pay.status).toBe(200);
    expect(pay.body.nextStatus).toBe('PAID');

    const created = await runCreateApHttp(mockEnv({ FEATURE_LEDGER_AR_AP: '1' }), 't1', {
      supplierId: 'sup1',
      amountCents: 2500,
      dueDateIso: '2026-09-01 00:00:00',
    });
    expect(created.status).toBe(200);

    const reject = await runCreateApHttp(mockEnv({ FEATURE_LEDGER_AR_AP: '1' }), 't1', {
      supplierId: '',
      amountCents: 10,
    });
    expect(reject.status).toBe(422);
  });

  it('PO create + transition', async () => {
    expect(
      (await runCreatePoHttp({ FEATURE_PURCHASING_ORDERS: '0' } as WorkerEnv, 't1', 'u1', {}))
        .status,
    ).toBe(404);
    const bad = await runCreatePoHttp(mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }), 't1', 'u1', {});
    expect(bad.status).toBe(400);
    const created = await runCreatePoHttp(mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }), 't1', 'u1', {
      branchId: 'b1',
      supplierId: 's1',
      totalAmountCents: 100,
    });
    expect(created.status).toBe(200);

    const withLines = await runCreatePoHttp(
      mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }),
      't1',
      'u1',
      {
        branchId: 'b1',
        supplierId: 's1',
        totalAmountCents: 300,
        lines: [
          { productId: 'p1', quantity: 5, unitCostCents: 30 },
          { productId: 'p2', quantity: 10, unitCostCents: 15 },
        ],
      },
    );
    expect(withLines.status).toBe(200);
    expect((withLines.body as { lines: number }).lines).toBe(2);

    const badLine = await runCreatePoHttp(mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }), 't1', 'u1', {
      branchId: 'b1',
      supplierId: 's1',
      totalAmountCents: 300,
      lines: [{ productId: '', quantity: 5, unitCostCents: 30 }],
    });
    expect(badLine.status).toBe(422);
    expect((badLine.body as { code: string }).code).toBe('PO_LINE_INVALID');

    const trBad = await runTransitionPoHttp(
      mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }, { first: { id: 'po1', status: 'DRAFT' } }),
      't1',
      { purchaseOrderId: 'po1', toStatus: 'RECEIVED' },
    );
    expect(trBad.status).toBe(422);

    const trOk = await runTransitionPoHttp(
      mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }, { first: { id: 'po1', status: 'DRAFT' } }),
      't1',
      { purchaseOrderId: 'po1', toStatus: 'SENT' },
    );
    expect(trOk.status).toBe(200);

    const missing = await runTransitionPoHttp(
      mockEnv({ FEATURE_PURCHASING_ORDERS: '1' }, { first: null }),
      't1',
      { purchaseOrderId: 'po-x', toStatus: 'SENT' },
    );
    expect(missing.status).toBe(404);
  });

  it('expense create', async () => {
    expect(
      (await runCreateExpenseHttp({ FEATURE_CASH_EXPENSES: '0' } as WorkerEnv, 't1', 'u1', {}))
        .status,
    ).toBe(404);
    const ok = await runCreateExpenseHttp(mockEnv({ FEATURE_CASH_EXPENSES: '1' }), 't1', 'u1', {
      branchId: 'b1',
      cashRegisterSessionId: 'sess',
      category: 'SUPPLIES',
      amountCents: 500,
      description: 'Bolsas',
    });
    expect(ok.status).toBe(200);
    const bad = await runCreateExpenseHttp(mockEnv({ FEATURE_CASH_EXPENSES: '1' }), 't1', 'u1', {
      branchId: 'b1',
      cashRegisterSessionId: 'sess',
      category: 'OTHER',
      amountCents: 0,
      description: 'x',
    });
    expect(bad.status).toBe(422);
  });

  it('owner day summary', async () => {
    const off = await runOwnerDaySummaryHttp(
      { FEATURE_OWNER_MODE: '0' } as WorkerEnv,
      't1',
      '2026-08-04',
    );
    expect(off.status).toBe(404);
    const badDate = await runOwnerDaySummaryHttp(
      mockEnv({ FEATURE_OWNER_MODE: '1' }),
      't1',
      'nope',
    );
    expect(badDate.status).toBe(400);
    const ok = await runOwnerDaySummaryHttp(
      mockEnv(
        { FEATURE_OWNER_MODE: '1' },
        {
          all: [
            {
              branch_id: 'b1',
              report_date: '2026-08-04',
              gross_sales_cents: 1000,
              net_sales_cents: 900,
              doc_count: 2,
              discounts_cents: 0,
              cogs_cents: 100,
            },
          ],
        },
      ),
      't1',
      '2026-08-04',
    );
    expect(ok.status).toBe(200);
    expect(ok.body.rankingClaimFrozen).toBe(true);
    expect((ok.body.totals as { netSalesCents: number }).netSalesCents).toBe(900);
  });
});
