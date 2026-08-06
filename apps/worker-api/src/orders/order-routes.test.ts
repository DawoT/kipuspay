import { describe, expect, it } from 'vitest';
import {
  isOrdersKdsEnabled,
  runCancelOrderItemHttp,
  runCreateOrderHttp,
  runFireOrderHttp,
  runMarkItemsReadyHttp,
  runSplitBillHttp,
} from './order-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

type Row = Record<string, unknown>;

function mockEnv(
  overrides: Partial<WorkerEnv> = {},
  opts: { orderStatus?: string; itemStatus?: string; itemRows?: Row[] } = {},
): WorkerEnv {
  const orderStatus = opts.orderStatus ?? 'OPEN';
  const itemStatus = opts.itemStatus ?? 'READY';
  const defaultItems = [
    {
      id: 'i1',
      product_id: 'p1',
      product_name: 'A',
      unit_price_cents: 1000,
      quantity: 1,
      status: 'READY',
      sale_id: null,
    },
    {
      id: 'i2',
      product_id: 'p2',
      product_name: 'B',
      unit_price_cents: 2500,
      quantity: 1,
      status: 'READY',
      sale_id: null,
    },
  ];
  const itemRows = opts.itemRows ?? defaultItems;
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
        if (sql.includes('FROM products')) {
          return Promise.resolve({ name: 'Pizza', price_cents: 5000 } as T);
        }
        if (sql.includes('FROM orders')) {
          return Promise.resolve({
            id: 'o1',
            status: orderStatus,
            branch_id: 'b1',
          } as T);
        }
        if (sql.includes('FROM order_items') && sql.includes('SELECT id, status, order_id')) {
          return Promise.resolve({
            id: 'item-1',
            status: itemStatus,
            order_id: 'o1',
          } as T);
        }
        if (sql.includes('FROM order_items') && sql.includes('oi.order_id')) {
          return Promise.resolve({ order_id: 'o1', branch_id: 'b1' } as T);
        }
        if (sql.includes('FROM authorization_tokens')) {
          return Promise.resolve({ id: 'tok1' } as T);
        }
        if (sql.includes('FROM branch_document_series')) {
          return Promise.resolve({ id: 'ser1' } as T);
        }
        if (sql.includes('FROM audit_events')) {
          return Promise.resolve(null);
        }
        if (sql.includes('FROM order_items')) {
          return Promise.resolve({
            id: 'item-1',
            status: itemStatus,
            order_id: 'o1',
          } as T);
        }
        return Promise.resolve(null);
      },
      all<T>() {
        if (sql.includes('FROM order_items')) {
          return Promise.resolve(okResult<T>(itemRows as T[]));
        }
        return Promise.resolve(okResult<T>());
      },
      run<T>() {
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
    TENANT_KV: { get: () => Promise.resolve(null) },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(new Response('{}')) }),
    },
    BRANCH_KDS_HUB_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(Response.json({ ok: true })) }),
    },
    ...overrides,
  };
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
  });

  it('crea orden con precio servidor (ignora cliente)', async () => {
    const res = await runCreateOrderHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      tableLabel: 'T1',
      items: [{ productId: 'p1', quantity: 2, unitPriceCents: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.itemCount).toBe(1);
  });
});

describe('runFireOrderHttp', () => {
  it('dispara a FIRED y notifica KDS', async () => {
    const res = await runFireOrderHttp(mockEnv(), 't1', { orderId: 'o1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('FIRED');
    expect(res.body.kdsVisible).toBe(true);
  });
});

describe('runMarkItemsReadyHttp', () => {
  it('marca ítems FIRED→READY', async () => {
    const res = await runMarkItemsReadyHttp(
      mockEnv(
        {},
        {
          orderStatus: 'FIRED',
          itemRows: [
            { id: 'i1', status: 'FIRED' },
            { id: 'i2', status: 'FIRED' },
          ],
        },
      ),
      't1',
      { orderId: 'o1', orderItemIds: ['i1', 'i2'] },
    );
    expect(res.status).toBe(200);
    expect(res.body.itemReadyCount).toBe(2);
    expect(res.body.orderStatus).toBe('READY');
  });
});

describe('runCancelOrderItemHttp', () => {
  it('403 READY sin token', async () => {
    const res = await runCancelOrderItemHttp(mockEnv(), 't1', 'u1', {
      orderItemId: 'item-1',
      authorizedCancelBy: 'mgr',
    });
    expect(res.status).toBe(403);
  });

  it('cancela READY con token', async () => {
    const res = await runCancelOrderItemHttp(mockEnv(), 't1', 'u1', {
      orderItemId: 'item-1',
      authorizedCancelBy: 'mgr',
      authTokenHash: 'abc',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });
});

describe('runSplitBillHttp', () => {
  it('exige sesión/series/método', async () => {
    const res = await runSplitBillHttp(mockEnv({}, { orderStatus: 'READY' }), 't1', 'u1', {
      orderId: 'o1',
      portions: [{ saleId: 's1', itemIds: ['i1', 'i2'] }],
    });
    expect(res.status).toBe(400);
  });

  it('split → PAID con 2 sales', async () => {
    const res = await runSplitBillHttp(mockEnv({}, { orderStatus: 'READY' }), 't1', 'u1', {
      orderId: 'o1',
      cashRegisterSessionId: 'sess1',
      series: 'NV01',
      paymentMethodId: 'pm1',
      portions: [
        { saleId: 's1', itemIds: ['i1'] },
        { saleId: 's2', itemIds: ['i2'] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.orderStatus).toBe('PAID');
    expect(res.body.portions).toHaveLength(2);
  });

  it('rechaza orden no cobrable', async () => {
    const res = await runSplitBillHttp(mockEnv({}, { orderStatus: 'OPEN' }), 't1', 'u1', {
      orderId: 'o1',
      cashRegisterSessionId: 'sess1',
      series: 'NV01',
      paymentMethodId: 'pm1',
      portions: [{ saleId: 's1', itemIds: ['i1', 'i2'] }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ORDER_NOT_BILLABLE');
  });
});
