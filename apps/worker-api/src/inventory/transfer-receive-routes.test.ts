import { describe, expect, it } from 'vitest';
import {
  isPartialReceiveEnabled,
  isStockTransfersEnabled,
  runPartialReceivePoHttp,
  runReceiveTransferHttp,
  runShipTransferHttp,
} from './transfer-receive-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(overrides: Partial<WorkerEnv> = {}, transferStatus = 'DRAFT'): WorkerEnv {
  const statements: unknown[] = [];
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

  function prepareStatement(sql: string): D1PreparedStatement {
    const binds: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        binds.push(...args);
        return stmt;
      },
      first<T>() {
        if (sql.includes('FROM stock_transfers')) {
          return Promise.resolve({ id: 'tr-1', status: transferStatus } as T);
        }
        if (sql.includes('FROM purchase_orders')) {
          return Promise.resolve({ id: 'po-1', status: 'PARTIALLY_RECEIVED' } as T);
        }
        return Promise.resolve(null);
      },
      all<T>() {
        if (sql.includes('FROM stock_transfer_lines')) {
          return Promise.resolve(okResult<T>([{ id: 'l1', qty_sent: 10 }] as T[]));
        }
        if (sql.includes('FROM purchase_order_items')) {
          return Promise.resolve(
            okResult<T>([
              { product_id: 'p1', quantity: 10, quantity_received: 4, unit_cost_cents: 500 },
            ] as T[]),
          );
        }
        return Promise.resolve(okResult<T>());
      },
      run<T>() {
        statements.push({ sql, binds });
        return Promise.resolve(okResult<T>());
      },
      raw<T>(): Promise<[string[], ...T[]]> {
        return Promise.resolve([[] as string[], ...([] as T[])]);
      },
    };
    return stmt;
  }

  const db = {
    prepare(sql: string) {
      return prepareStatement(sql);
    },
    batch<T>(stmts: D1PreparedStatement[]) {
      statements.push({ batch: stmts.length });
      return Promise.resolve(stmts.map(() => okResult<T>()));
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
    withSession() {
      return {
        prepare(sql2: string) {
          return prepareStatement(sql2);
        },
        batch<T>(stmts: D1PreparedStatement[]) {
          return Promise.resolve(stmts.map(() => okResult<T>()));
        },
        getBookmark() {
          return null;
        },
      };
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
  } satisfies D1Database;
  return {
    FEATURE_STOCK_TRANSFERS: '1',
    FEATURE_PURCHASING_PARTIAL_RECEIVE: '1',
    DB: db,
    TENANT_KV: { get: () => null },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => new Response('{}') }),
    },
    ...overrides,
  } as WorkerEnv;
}

describe('flags', () => {
  it('transfers default off', () => {
    expect(isStockTransfersEnabled({} as WorkerEnv)).toBe(false);
    expect(isStockTransfersEnabled({ FEATURE_STOCK_TRANSFERS: 'true' } as WorkerEnv)).toBe(true);
  });

  it('partial receive default off', () => {
    expect(isPartialReceiveEnabled({} as WorkerEnv)).toBe(false);
    expect(isPartialReceiveEnabled({ FEATURE_PURCHASING_PARTIAL_RECEIVE: '1' } as WorkerEnv)).toBe(
      true,
    );
  });
});

describe('runShipTransferHttp', () => {
  it('FEATURE_OFF', async () => {
    const res = await runShipTransferHttp({ FEATURE_STOCK_TRANSFERS: '0' } as WorkerEnv, 't1', {});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('exige transferId', async () => {
    const res = await runShipTransferHttp(mockEnv(), 't1', {});
    expect(res.status).toBe(400);
  });

  it('envía a IN_TRANSIT', async () => {
    const res = await runShipTransferHttp(mockEnv(), 't1', { transferId: 'tr-1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_TRANSIT');
  });
});

describe('runReceiveTransferHttp', () => {
  it('exige transferId', async () => {
    const res = await runReceiveTransferHttp(mockEnv(), 't1', {});
    expect(res.status).toBe(400);
  });

  it('recibe línea conservando cantidades', async () => {
    const res = await runReceiveTransferHttp(mockEnv({}, 'IN_TRANSIT'), 't1', {
      transferId: 'tr-1',
      lines: [{ lineId: 'l1', qtyReceived: 10 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
  });

  it('rechaza línea desconocida', async () => {
    const res = await runReceiveTransferHttp(mockEnv({}, 'IN_TRANSIT'), 't1', {
      transferId: 'tr-1',
      lines: [{ lineId: 'nope', qtyReceived: 1 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UNKNOWN_TRANSFER_LINE');
  });

  it('rechaza shrink sin razón', async () => {
    const res = await runReceiveTransferHttp(mockEnv({}, 'IN_TRANSIT'), 't1', {
      transferId: 'tr-1',
      lines: [{ lineId: 'l1', qtyReceived: 9, qtyShrink: 1 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SHRINK_REASON_REQUIRED');
  });
});

describe('runPartialReceivePoHttp', () => {
  it('exige poId y branchId', async () => {
    const res = await runPartialReceivePoHttp(mockEnv(), 't1', 'u1', {});
    expect(res.status).toBe(400);
  });

  it('recibe parcialmente y acumula', async () => {
    const res = await runPartialReceivePoHttp(mockEnv(), 't1', 'u1', {
      purchaseOrderId: 'po-1',
      branchId: 'b1',
      lines: [{ productId: 'p1', quantity: 4, unitCostCents: 500 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.purchaseOrderId).toBe('po-1');
    expect(res.body.nextStatus).toBeTruthy();
  });

  it('rechaza exceder lo ordenado', async () => {
    const res = await runPartialReceivePoHttp(mockEnv(), 't1', 'u1', {
      purchaseOrderId: 'po-1',
      branchId: 'b1',
      lines: [{ productId: 'p1', quantity: 7, unitCostCents: 500 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RECEIVE_EXCEEDS_ORDERED');
  });
});
