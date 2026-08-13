import { describe, expect, it } from 'vitest';
import {
  processOrderBillingAtomic,
  cancelOrderItemAtomic,
} from './process-order-billing-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

type Row = Record<string, unknown>;

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(state: {
  order?: Row | null;
  items?: Row[];
  series?: Row | null;
  token?: Row | null;
  audit?: Row | null;
  sqls?: string[];
}): D1DatabaseLike {
  const stmts: unknown[] = [];
  return {
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        first: <T>() => {
          state.sqls?.push(sql);
          if (sql.includes('FROM orders'))
            return Promise.resolve((state.order ?? null) as T | null);
          if (sql.includes('FROM branch_document_series')) {
            return Promise.resolve((state.series ?? null) as T | null);
          }
          if (sql.includes('FROM authorization_tokens')) {
            return Promise.resolve((state.token ?? null) as T | null);
          }
          if (sql.includes('FROM audit_events')) {
            return Promise.resolve((state.audit ?? null) as T | null);
          }
          if (sql.includes('FROM order_items') && !sql.includes('SELECT id, product_id')) {
            return Promise.resolve((state.items?.[0] ?? null) as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult((state.items ?? []) as T[])),
        run: () => {
          state.sqls?.push(sql);
          stmts.push({ sql, binds });
          return Promise.resolve(okResult());
        },
      };
      return stmt;
    },
    batch: (batchStmts: readonly D1Bound[]) => {
      state.sqls?.push(...batchStmts.map((s) => (s as { sql?: string }).sql ?? ''));
      stmts.push({ batch: batchStmts.length });
      return Promise.resolve(batchStmts.map(() => okResult()));
    },
  };
}

describe('processOrderBillingAtomic', () => {
  it('rechaza orden no encontrada', async () => {
    await expect(
      processOrderBillingAtomic(mockDb({ order: null }), 't1', 'u1', {
        orderId: 'o1',
        cashRegisterSessionId: 's1',
        series: 'NV01',
        paymentMethodId: 'pm1',
        portions: [{ saleId: 'sale1', itemIds: ['i1'] }],
      }),
    ).rejects.toThrow('ORDER_NOT_FOUND');
  });

  it('rechaza orden OPEN', async () => {
    await expect(
      processOrderBillingAtomic(
        mockDb({ order: { id: 'o1', branch_id: 'b1', status: 'OPEN' } }),
        't1',
        'u1',
        {
          orderId: 'o1',
          cashRegisterSessionId: 's1',
          series: 'NV01',
          paymentMethodId: 'pm1',
          portions: [{ saleId: 'sale1', itemIds: ['i1'] }],
        },
      ),
    ).rejects.toThrow('ORDER_NOT_BILLABLE');
  });

  it('split 2 porciones → 2 sales y PAID', async () => {
    const db = mockDb({
      order: { id: 'o1', branch_id: 'b1', status: 'READY' },
      series: { id: 'ser1' },
      items: [
        {
          id: 'i1',
          product_id: 'p1',
          product_name: 'A',
          quantity: 1,
          unit_price_cents: 1000,
          status: 'READY',
          sale_id: null,
        },
        {
          id: 'i2',
          product_id: 'p2',
          product_name: 'B',
          quantity: 1,
          unit_price_cents: 2000,
          status: 'READY',
          sale_id: null,
        },
      ],
    });
    const res = await processOrderBillingAtomic(db, 't1', 'u1', {
      orderId: 'o1',
      cashRegisterSessionId: 's1',
      series: 'NV01',
      paymentMethodId: 'pm1',
      portions: [
        { saleId: 'sale1', itemIds: ['i1'] },
        { saleId: 'sale2', itemIds: ['i2'] },
      ],
    });
    expect(res.orderStatus).toBe('PAID');
    expect(res.sales).toHaveLength(2);
    expect(res.sales[0]!.amountCents).toBe(1000);
    expect(res.sales[1]!.amountCents).toBe(2000);
  });

  it('S19-H2: split con documentType 03 busca serie Boleta y emite PENDING', async () => {
    const sqls: string[] = [];
    const db = mockDb({
      sqls,
      order: { id: 'o1', branch_id: 'b1', status: 'READY' },
      series: { id: 'ser-b1' },
      items: [
        {
          id: 'i1',
          product_id: 'p1',
          product_name: 'A',
          quantity: 1,
          unit_price_cents: 1000,
          status: 'READY',
          sale_id: null,
        },
      ],
    });
    const res = await processOrderBillingAtomic(db, 't1', 'u1', {
      orderId: 'o1',
      cashRegisterSessionId: 's1',
      series: 'B001',
      paymentMethodId: 'pm1',
      portions: [{ saleId: 'sale1', itemIds: ['i1'] }],
      documentType: '03',
    });
    expect(res.orderStatus).toBe('PAID');
    // La búsqueda de serie ya no hardcodea 'NV' — usa document_type_code = ? (bind 03).
    expect(sqls.some((s) => s.includes('document_type_code = ?'))).toBe(true);
    // El SQL de venta dejó de tener el literal 'NV' fijo.
    expect(sqls.some((s) => s.includes("'NV', ?,"))).toBe(false);
  });

  it('rechaza re-bill', async () => {
    await expect(
      processOrderBillingAtomic(
        mockDb({
          order: { id: 'o1', branch_id: 'b1', status: 'READY' },
          items: [
            {
              id: 'i1',
              product_id: 'p1',
              product_name: 'A',
              quantity: 1,
              unit_price_cents: 1000,
              status: 'BILLED',
              sale_id: 'sOld',
            },
          ],
        }),
        't1',
        'u1',
        {
          orderId: 'o1',
          cashRegisterSessionId: 's1',
          series: 'NV01',
          paymentMethodId: 'pm1',
          portions: [{ saleId: 'sale1', itemIds: ['i1'] }],
        },
      ),
    ).rejects.toThrow('ORDER_ALREADY_BILLED');
  });
});

describe('cancelOrderItemAtomic', () => {
  it('READY sin token → AUTH_TOKEN_REQUIRED', async () => {
    await expect(
      cancelOrderItemAtomic(
        mockDb({
          items: [{ id: 'i1', status: 'READY', order_id: 'o1' }],
        }),
        't1',
        'u1',
        { orderItemId: 'i1', authTokenHash: null, authorizedByUserId: 'mgr' },
      ),
    ).rejects.toThrow('AUTH_TOKEN_REQUIRED');
  });

  it('READY con token consume y cancela', async () => {
    const res = await cancelOrderItemAtomic(
      mockDb({
        items: [{ id: 'i1', status: 'READY', order_id: 'o1' }],
        token: { id: 'tok1' },
      }),
      't1',
      'u1',
      { orderItemId: 'i1', authTokenHash: 'hash1', authorizedByUserId: 'mgr' },
    );
    expect(res.status).toBe('CANCELLED');
  });
});
