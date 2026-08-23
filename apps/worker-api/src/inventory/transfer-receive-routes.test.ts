import { describe, expect, it, vi } from 'vitest';
import {
  isPartialReceiveEnabled,
  isStockTransfersEnabled,
  runCancelTransferHttp,
  runCreateTransferHttp,
  runOwnerPendingTransfersHttp,
  runPartialReceivePoHttp,
  runReceiveTransferHttp,
  runShipTransferHttp,
} from './transfer-receive-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  createStockTransferAtomic: vi.fn(() => Promise.resolve({ id: 'tr-new', status: 'DRAFT' })),
  shipStockTransferAtomic: vi.fn(() => Promise.resolve({ id: 'tr-1', status: 'IN_TRANSIT' })),
  receiveStockTransferAtomic: vi.fn(() => Promise.resolve({ id: 'tr-1', status: 'RECEIVED' })),
  cancelStockTransferAtomic: vi.fn(() => Promise.resolve({ id: 'tr-1', status: 'CANCELLED' })),
  processPartialReceiveAtomic: vi.fn(() =>
    Promise.resolve({
      receiptId: 'rc1',
      purchaseOrderId: 'po-1',
      nextStatus: 'PARTIALLY_RECEIVED',
      apId: 'ap1',
      apAmountCents: 2000,
    }),
  ),
}));

function mockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  const meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
  const okResult = <T>(results: T[] = [] as T[]) => ({
    success: true as const,
    meta,
    results,
  });

  const db = {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: () => Promise.resolve(null),
        all: <T>() => {
          if (sql.includes("status = 'IN_TRANSIT'")) {
            return Promise.resolve(
              okResult([
                {
                  id: 'tr-1',
                  from_branch_id: 'b1',
                  to_branch_id: 'b2',
                  status: 'IN_TRANSIT',
                  shipped_at: '2026-08-05',
                  created_by_user_id: 'u1',
                },
              ] as T[]),
            );
          }
          if (sql.includes('qty_shrink > 0')) {
            return Promise.resolve(
              okResult([
                {
                  transfer_id: 'tr-2',
                  line_id: 'l1',
                  product_id: 'p1',
                  qty_sent: 10,
                  qty_received: 8,
                  qty_shrink: 2,
                  shrink_reason: 'roto',
                },
              ] as T[]),
            );
          }
          return Promise.resolve(okResult());
        },
        run: () => Promise.resolve(okResult()),
        raw: () => Promise.resolve([[]]),
      };
      return stmt;
    },
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    withSession: () => db,
  };

  return {
    FEATURE_STOCK_TRANSFERS: '1',
    FEATURE_PURCHASING_PARTIAL_RECEIVE: '1',
    DB: db as unknown as D1Database,
    ...overrides,
  } as WorkerEnv;
}

describe('transfer flags', () => {
  it('transfers default off', () => {
    expect(isStockTransfersEnabled({} as WorkerEnv)).toBe(false);
    expect(isStockTransfersEnabled({ FEATURE_STOCK_TRANSFERS: 'true' } as WorkerEnv)).toBe(true);
  });

  it('partial receive flag', () => {
    expect(isPartialReceiveEnabled({} as WorkerEnv)).toBe(false);
    expect(isPartialReceiveEnabled({ FEATURE_PURCHASING_PARTIAL_RECEIVE: '1' } as WorkerEnv)).toBe(
      true,
    );
  });
});

describe('runCreateTransferHttp', () => {
  it('feature off', async () => {
    const res = await runCreateTransferHttp(
      { FEATURE_STOCK_TRANSFERS: '0' } as WorkerEnv,
      't1',
      'u1',
      {},
    );
    expect(res.status).toBe(404);
  });

  it('crea DRAFT', async () => {
    const res = await runCreateTransferHttp(mockEnv(), 't1', 'u1', {
      fromBranchId: 'b1',
      toBranchId: 'b2',
      lines: [{ productId: 'p1', qtySent: 5 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
  });
});

describe('runShipTransferHttp', () => {
  it('exige transferId', async () => {
    const res = await runShipTransferHttp(mockEnv(), 't1', 'u1', {});
    expect(res.status).toBe(400);
  });

  it('ship ok', async () => {
    const res = await runShipTransferHttp(mockEnv(), 't1', 'u1', { transferId: 'tr-1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_TRANSIT');
  });
});

describe('runReceiveTransferHttp', () => {
  it('receive ok', async () => {
    const res = await runReceiveTransferHttp(mockEnv(), 't1', 'u1', {
      transferId: 'tr-1',
      lines: [{ lineId: 'l1', qtyReceived: 10, qtyShrink: 0, shrinkReason: null }],
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
  });
});

describe('runCancelTransferHttp', () => {
  it('cancel ok', async () => {
    const res = await runCancelTransferHttp(mockEnv(), 't1', 'u1', { transferId: 'tr-1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });
});

describe('runPartialReceivePoHttp', () => {
  it('parcial + AP', async () => {
    const res = await runPartialReceivePoHttp(mockEnv(), 't1', 'u1', {
      purchaseOrderId: 'po-1',
      branchId: 'b1',
      lines: [{ productId: 'p1', quantity: 4, unitCostCents: 500 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.apAmountCents).toBe(2000);
    expect(res.body.nextStatus).toBe('PARTIALLY_RECEIVED');
  });
});

describe('runOwnerPendingTransfersHttp', () => {
  it('lista pendientes y discrepancias', async () => {
    const res = await runOwnerPendingTransfersHttp(mockEnv(), 't1');
    expect(res.status).toBe(200);
    expect((res.body.pending as unknown[]).length).toBe(1);
    expect((res.body.discrepancies as unknown[]).length).toBe(1);
  });
});
