import { describe, expect, it, vi } from 'vitest';
import {
  processSupplierReturnCloseAtomic,
  processSupplierReturnCreateAtomic,
} from './process-supplier-return-atomic.js';
import type { D1DatabaseLike } from './index.js';

type Row = Record<string, unknown> | null;

function mockDb(state: {
  ret?: Row;
  users?: Row;
  lines?: Row[];
  stock?: Row;
  ap?: Row;
  guardOk?: boolean;
}): D1DatabaseLike {
  const batch = vi.fn(async (stmts: readonly { bind?(): unknown; run?(): Promise<unknown>; all?(): Promise<unknown> }[]) => {
    // Simular el atomic_guard: si guardOk es false → CHECK falla
    if (state.guardOk === false) {
      const err = new Error('CHECK constraint failed: ok=1');
      (err as { code?: string }).code = 'SQLITE_CONSTRAINT_CHECK';
      throw err;
    }
    return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
  });
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM supplier_returns')) return Promise.resolve((state.ret ?? null) as T | null);
          if (sql.includes('FROM users')) return Promise.resolve((state.users ?? null) as T | null);
          if (sql.includes('FROM accounts_payable')) return Promise.resolve((state.ap ?? null) as T | null);
          if (sql.includes('FROM branch_product_stock')) return Promise.resolve((state.stock ?? null) as T | null);
          if (sql.includes('FROM purchase_receipt_lines')) {
            return Promise.resolve({ quantity_microunits: 5000000, unit_cost_cents: 100 } as T | null);
          }
          if (sql.includes('FROM supplier_invoices')) return Promise.resolve({ status: 'CLOSED', total_amount_cents: 1000 } as T | null);
          if (sql.includes('FROM supplier_invoice_lines')) {
            return Promise.resolve({ product_id: 'p1', quantity_microunits: 5000000, unit_cost_cents: 100 } as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve({ results: (state.lines ?? []) as T[] } as T),
        run: () =>
          Promise.resolve({ success: true, meta: { changes: 1 } } as never),
      };
      return stmt as never;
    },
    batch,
  } as unknown as D1DatabaseLike;
}

const baseReturn = {
  id: 'sr-1',
  status: 'OPEN',
  branch_id: 'b1',
  supplier_invoice_id: 'inv-1',
  purchase_receipt_id: 'rc-1',
  total_cents: 1000,
  created_by_user_id: 'u1',
};

describe('S34-H1: override de costo exige rol admin/owner', () => {
  it('autorizador cashier → FORBIDDEN_ROLE', async () => {
    const db = mockDb({
      ret: baseReturn,
      users: { role: 'cashier' },
      lines: [{ id: 'srl-1', product_id: 'p1', quantity_microunits: 2000000, unit_cost_cents: 100 }],
    });
    await expect(
      processSupplierReturnCloseAtomic(db, 't1', 'u1', {
        returnId: 'sr-1',
        priceDiffOverride: true,
        authorizedByUserId: 'u2',
      }, {}),
    ).rejects.toThrow('FORBIDDEN_ROLE');
  });

  it('autorizador inexistente → fail-closed FORBIDDEN_ROLE', async () => {
    const db = mockDb({
      ret: baseReturn,
      users: null,
      lines: [{ id: 'srl-1', product_id: 'p1', quantity_microunits: 2000000, unit_cost_cents: 100 }],
    });
    await expect(
      processSupplierReturnCloseAtomic(db, 't1', 'u1', {
        returnId: 'sr-1',
        priceDiffOverride: true,
        authorizedByUserId: 'ghost',
      }, {}),
    ).rejects.toThrow('FORBIDDEN_ROLE');
  });
});

describe('S34-H2: doble CLOSE concurrente aborta con guardState', () => {
  it('segundo close con estado ya CLOSED → CHECK revierte sin stock/CxP', async () => {
    const db = mockDb({
      ret: baseReturn,
      users: { role: 'admin' },
      lines: [{ id: 'srl-1', product_id: 'p1', quantity_microunits: 2000000, unit_cost_cents: 100 }],
      ap: { status: 'PARTIALLY_PAID', balance_due_cents: 1000 },
      stock: { stock: 10, stock_microunits: 10000000, pmp_unit_cost_cents: 100 },
      guardOk: false, // el guardState detecta que ya no está OPEN
    });
    await expect(
      processSupplierReturnCloseAtomic(db, 't1', 'u1', {
        returnId: 'sr-1',
        priceDiffOverride: true,
        authorizedByUserId: 'u2',
      }, {}),
    ).rejects.toThrow();
    // El batch jamás debió contener los writes de stock/CxP tras el guard.
    expect(db.batch).not.toHaveBeenCalled();
  });
});
