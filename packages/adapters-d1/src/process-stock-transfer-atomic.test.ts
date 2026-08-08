import { describe, expect, it } from 'vitest';
import {
  cancelStockTransferAtomic,
  createStockTransferAtomic,
  receiveStockTransferAtomic,
  shipStockTransferAtomic,
} from './process-stock-transfer-atomic.js';
import { processPartialReceiveAtomic } from './process-partial-receive-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

type Row = Record<string, unknown>;

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockTransferDb(state: {
  transfer?: Row | null;
  lines?: Row[];
  stock?: Row | null;
  product?: Row | null;
  audit?: Row | null;
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM stock_transfers')) {
            return Promise.resolve((state.transfer ?? null) as T | null);
          }
          if (sql.includes('FROM branch_product_stock')) {
            return Promise.resolve((state.stock ?? null) as T | null);
          }
          if (sql.includes('FROM products')) {
            return Promise.resolve((state.product ?? null) as T | null);
          }
          if (sql.includes('FROM audit_events')) {
            return Promise.resolve((state.audit ?? null) as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult((state.lines ?? []) as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

describe('process-stock-transfer-atomic', () => {
  it('create DRAFT con líneas', async () => {
    const res = await createStockTransferAtomic(mockTransferDb({}), 't1', 'u1', {
      fromBranchId: 'b1',
      toBranchId: 'b2',
      lines: [{ productId: 'p1', qtySent: 5 }],
    });
    expect(res.status).toBe('DRAFT');
    expect(res.id).toBeTruthy();
  });

  it('ship DRAFT→IN_TRANSIT', async () => {
    const res = await shipStockTransferAtomic(
      mockTransferDb({
        transfer: {
          id: 'tr1',
          from_branch_id: 'b1',
          to_branch_id: 'b2',
          status: 'DRAFT',
        },
        lines: [{ id: 'l1', product_id: 'p1', qty_sent: 3 }],
        stock: { stock: 10, stock_microunits: 10 * 1000000, pmp_unit_cost_cents: 100 },
      }),
      't1',
      'u1',
      'tr1',
    );
    expect(res.status).toBe('IN_TRANSIT');
  });

  it('ship rechaza stock insuficiente', async () => {
    await expect(
      shipStockTransferAtomic(
        mockTransferDb({
          transfer: {
            id: 'tr1',
            from_branch_id: 'b1',
            to_branch_id: 'b2',
            status: 'DRAFT',
          },
          lines: [{ id: 'l1', product_id: 'p1', qty_sent: 3 }],
          stock: { stock: 1, stock_microunits: 1 * 1000000, pmp_unit_cost_cents: 100 },
        }),
        't1',
        'u1',
        'tr1',
      ),
    ).rejects.toThrow('INSUFFICIENT_STOCK');
  });

  it('receive con conservación + shrink', async () => {
    const res = await receiveStockTransferAtomic(
      mockTransferDb({
        transfer: {
          id: 'tr1',
          from_branch_id: 'b1',
          to_branch_id: 'b2',
          status: 'IN_TRANSIT',
        },
        lines: [{ id: 'l1', product_id: 'p1', qty_sent: 5 }],
        stock: { stock: 0, stock_microunits: 0 * 1000000, pmp_unit_cost_cents: 100 },
        product: { cost_cents: 100 },
      }),
      't1',
      'u1',
      {
        transferId: 'tr1',
        lines: [{ lineId: 'l1', qtyReceived: 4, qtyShrink: 1, shrinkReason: 'roto en tránsito' }],
      },
    );
    expect(res.status).toBe('RECEIVED');
  });

  it('cancel IN_TRANSIT restaura', async () => {
    const res = await cancelStockTransferAtomic(
      mockTransferDb({
        transfer: {
          id: 'tr1',
          from_branch_id: 'b1',
          to_branch_id: 'b2',
          status: 'IN_TRANSIT',
        },
        lines: [{ id: 'l1', product_id: 'p1', qty_sent: 5 }],
        stock: { stock: 0, stock_microunits: 0 * 1000000, pmp_unit_cost_cents: 100 },
      }),
      't1',
      'u1',
      'tr1',
    );
    expect(res.status).toBe('CANCELLED');
  });

  it('cancel RECEIVED inválido', async () => {
    await expect(
      cancelStockTransferAtomic(
        mockTransferDb({
          transfer: {
            id: 'tr1',
            from_branch_id: 'b1',
            to_branch_id: 'b2',
            status: 'RECEIVED',
          },
          lines: [],
        }),
        't1',
        'u1',
        'tr1',
      ),
    ).rejects.toThrow(/TRANSFER_INVALID/);
  });
});

function mockPoDb(state: { po?: Row | null; items?: Row[]; stock?: Row | null }): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM purchase_orders')) {
            return Promise.resolve((state.po ?? null) as T | null);
          }
          if (sql.includes('FROM branch_product_stock')) {
            return Promise.resolve((state.stock ?? null) as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult((state.items ?? []) as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

describe('process-partial-receive-atomic', () => {
  it('parcial → PARTIALLY_RECEIVED + AP', async () => {
    const res = await processPartialReceiveAtomic(
      mockPoDb({
        po: { id: 'po1', status: 'SENT', supplier_id: 'sup1' },
        items: [
          {
            product_id: 'p1',
            quantity_ordered: 10,
            quantity_received: 0,
            unit_cost_cents: 100,
          },
        ],
        stock: { stock: 0, stock_microunits: 0 * 1000000, pmp_unit_cost_cents: 0 },
      }),
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        branchId: 'b1',
        lines: [{ productId: 'p1', quantity: 4, unitCostCents: 100 }],
      },
    );
    expect(res.nextStatus).toBe('PARTIALLY_RECEIVED');
    expect(res.apAmountCents).toBe(400);
    expect(res.apId).toBeTruthy();
  });

  it('completo → RECEIVED', async () => {
    const res = await processPartialReceiveAtomic(
      mockPoDb({
        po: { id: 'po1', status: 'PARTIALLY_RECEIVED', supplier_id: 'sup1' },
        items: [
          {
            product_id: 'p1',
            quantity_ordered: 10,
            quantity_received: 4,
            unit_cost_cents: 100,
          },
        ],
        stock: { stock: 4, stock_microunits: 4 * 1000000, pmp_unit_cost_cents: 100 },
      }),
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        branchId: 'b1',
        lines: [{ productId: 'p1', quantity: 6, unitCostCents: 100 }],
      },
    );
    expect(res.nextStatus).toBe('RECEIVED');
    expect(res.apAmountCents).toBe(600);
  });

  it('PO no encontrada', async () => {
    await expect(
      processPartialReceiveAtomic(mockPoDb({ po: null }), 't1', 'u1', {
        purchaseOrderId: 'x',
        branchId: 'b1',
        lines: [{ productId: 'p1', quantity: 1, unitCostCents: 100 }],
      }),
    ).rejects.toThrow('PO_NOT_FOUND');
  });
});
