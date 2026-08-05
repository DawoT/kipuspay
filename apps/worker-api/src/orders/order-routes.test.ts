import { describe, expect, it } from 'vitest';
import {
  isOrdersKdsEnabled,
  runCancelOrderItemHttp,
  runCreateOrderHttp,
  runFireOrderHttp,
  runSplitBillHttp,
} from './order-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(overrides: Partial<WorkerEnv> = {}, orderStatus = 'OPEN'): WorkerEnv {
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
        if (sql.includes('FROM orders')) {
          return Promise.resolve({ id: 'o1', status: orderStatus } as T);
        }
        if (sql.includes('FROM order_items')) {
          return Promise.resolve({ id: 'item-1', status: 'READY' } as T);
        }
        return Promise.resolve(null);
      },
      all<T>() {
        if (sql.includes('FROM order_items')) {
          return Promise.resolve(
            okResult<T>([
              { id: 'i1', unit_price_cents: 1000, quantity: 2, status: 'READY' },
              { id: 'i2', unit_price_cents: 2500, quantity: 1, status: 'READY' },
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
    FEATURE_ORDERS_KDS: '1',
    DB: db,
    TENANT_KV: { get: () => null },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => new Response('{}') }),
    },
    ...overrides,
  } as WorkerEnv;
}

describe('isOrdersKdsEnabled', () => {
  it('default off', () => {
    expect(isOrdersKdsEnabled({} as WorkerEnv)).toBe(false);
    expect(isOrdersKdsEnabled({ FEATURE_ORDERS_KDS: 'true' } as WorkerEnv)).toBe(true);
  });
});

describe('runCreateOrderHttp', () => {
  it('FEATURE_OFF sin flag', async () => {
    const res = await runCreateOrderHttp({ FEATURE_ORDERS_KDS: '0' } as WorkerEnv, 't1', 'u1', {});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('exige branchId', async () => {
    const res = await runCreateOrderHttp(mockEnv(), 't1', 'u1', {});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('rechaza sin ítems', async () => {
    const res = await runCreateOrderHttp(mockEnv(), 't1', 'u1', { branchId: 'b1' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ORDER_REQUIRES_ITEMS');
  });

  it('crea orden OPEN con ítems', async () => {
    const res = await runCreateOrderHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      tableLabel: 'T1',
      items: [{ productId: 'p1', productName: 'Pizza', quantity: 2, unitPriceCents: 5000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.itemCount).toBe(1);
  });
});

describe('runFireOrderHttp', () => {
  it('exige orderId', async () => {
    const res = await runFireOrderHttp(mockEnv(), 't1', {});
    expect(res.status).toBe(400);
  });

  it('dispara a FIRED', async () => {
    const res = await runFireOrderHttp(mockEnv(), 't1', { orderId: 'o1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('FIRED');
    expect(res.body.kdsVisible).toBe(true);
  });
});

describe('runCancelOrderItemHttp', () => {
  it('exige orderItemId', async () => {
    const res = await runCancelOrderItemHttp(mockEnv(), 't1', {});
    expect(res.status).toBe(400);
  });

  it('cancela ítem READY con authz', async () => {
    const res = await runCancelOrderItemHttp(mockEnv(), 't1', {
      orderItemId: 'item-1',
      authorizedCancelBy: 'supervisor',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('403 sin authz para READY', async () => {
    const res = await runCancelOrderItemHttp(mockEnv(), 't1', { orderItemId: 'item-1' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH_TOKEN_REQUIRED');
  });
});

describe('runSplitBillHttp', () => {
  it('parte sin solapar', async () => {
    const res = await runSplitBillHttp(mockEnv({}, 'READY'), 't1', {
      orderId: 'o1',
      portions: [{ saleId: 's1', itemIds: ['i1', 'i2'] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.portions).toHaveLength(1);
  });

  it('422 si la porción es incompleta', async () => {
    const res = await runSplitBillHttp(mockEnv({}, 'READY'), 't1', {
      orderId: 'o1',
      portions: [{ saleId: 's1', itemIds: ['i1'] }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SPLIT_INCOMPLETE');
  });

  it('rechaza orden no cobrable', async () => {
    const res = await runSplitBillHttp(mockEnv({}, 'OPEN'), 't1', {
      orderId: 'o1',
      portions: [{ saleId: 's1', itemIds: ['i1'] }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ORDER_NOT_BILLABLE');
  });
});
