import { describe, expect, it } from 'vitest';
import {
  loadBatchesForProduct,
  loadBomComponents,
  planBomExplosion,
  planFefoForQty,
  resolveServerUnitPriceCents,
} from './s18-sale-inventory.js';
import type { D1DatabaseLike } from './index.js';

type Row = Record<string, unknown>;

function mockDb(handlers: {
  first?: (sql: string, binds: unknown[]) => Row | null;
  all?: (sql: string, binds: unknown[]) => Row[];
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        first: <T>() => Promise.resolve((handlers.first?.(sql, binds) ?? null) as T | null),
        all: <T>() =>
          Promise.resolve({
            results: (handlers.all?.(sql, binds) ?? []) as T[],
            success: true,
          }),
        run: () => Promise.resolve({ success: true }),
      };
      return stmt;
    },
    batch: () => Promise.resolve([]),
  } as unknown as D1DatabaseLike;
}

describe('s18-sale-inventory helpers', () => {
  it('FEFO ordena por vencimiento', () => {
    const alloc = planFefoForQty(
      [
        { batchId: 'new', productId: 'p1', qty: 5, expiresAtUtc: '2026-12-01T00:00:00Z' },
        { batchId: 'old', productId: 'p1', qty: 5, expiresAtUtc: '2026-09-01T00:00:00Z' },
      ],
      'p1',
      3,
      '2026-08-05T00:00:00Z',
    );
    expect(alloc[0]!.batchId).toBe('old');
    expect(alloc[0]!.qty).toBe(3);
  });

  it('BOM explota kit', () => {
    expect(planBomExplosion([{ componentProductId: 'c1', qtyPerKit: 2 }], 4)).toEqual([
      { componentProductId: 'c1', qty: 8 },
    ]);
  });

  it('precio lista deshabilitado usa default', async () => {
    const price = await resolveServerUnitPriceCents(
      mockDb({}),
      't1',
      'b1',
      null,
      'p1',
      1500,
      false,
    );
    expect(price).toBe(1500);
  });

  it('resuelve precio de lista de sucursal', async () => {
    const db = mockDb({
      first: (sql) => {
        if (sql.includes('FROM branches')) return { price_list_id: 'pl-b' };
        if (sql.includes('FROM product_prices') && sql.includes('price_list_id = ?')) {
          return { price_cents: 2200 };
        }
        return null;
      },
    });
    const price = await resolveServerUnitPriceCents(db, 't1', 'b1', null, 'p1', 1500, true);
    expect(price).toBe(2200);
  });

  it('usa lista customer cuando branch no tiene precio', async () => {
    const db = mockDb({
      first: (sql) => {
        if (sql.includes('FROM branches')) return { price_list_id: null };
        if (sql.includes('FROM customers')) return { price_list_id: 'pl-c' };
        if (sql.includes('FROM product_prices')) return { price_cents: 3300 };
        return null;
      },
    });
    const price = await resolveServerUnitPriceCents(db, 't1', 'b1', 'cust1', 'p1', 1500, true);
    expect(price).toBe(3300);
  });

  it('branch gana sobre customer (resolveUnitPriceCents)', async () => {
    let priceCalls = 0;
    const db = mockDb({
      first: (sql) => {
        if (sql.includes('FROM branches')) return { price_list_id: 'pl-b' };
        if (sql.includes('FROM customers')) return { price_list_id: 'pl-c' };
        if (sql.includes('FROM product_prices')) {
          priceCalls += 1;
          return { price_cents: priceCalls === 1 ? 2200 : 3300 };
        }
        return null;
      },
    });
    const price = await resolveServerUnitPriceCents(db, 't1', 'b1', 'cust1', 'p1', 1500, true);
    expect(price).toBe(2200);
  });

  it('fallback a lista default del tenant', async () => {
    const db = mockDb({
      first: (sql) => {
        if (sql.includes('FROM branches')) return { price_list_id: null };
        if (sql.includes('FROM price_lists')) return { price_cents: 1800 };
        return null;
      },
    });
    const price = await resolveServerUnitPriceCents(db, 't1', 'b1', null, 'p1', 1500, true);
    expect(price).toBe(1800);
  });

  it('sin listas usa default de catálogo', async () => {
    const db = mockDb({
      first: () => null,
    });
    const price = await resolveServerUnitPriceCents(db, 't1', 'b1', null, 'p1', 1500, true);
    expect(price).toBe(1500);
  });

  it('carga lotes FEFO y normaliza expiration', async () => {
    const db = mockDb({
      all: () => [
        {
          id: 'bat1',
          product_id: 'p1',
          stock: 4,
          expiration_date: '2026-10-01',
        },
        {
          id: 'bat2',
          product_id: 'p1',
          stock: 2,
          expiration_date: null,
        },
      ],
    });
    const batches = await loadBatchesForProduct(db, 't1', 'b1', 'p1');
    expect(batches).toEqual([
      {
        batchId: 'bat1',
        productId: 'p1',
        qty: 4,
        expiresAtUtc: '2026-10-01T00:00:00.000Z',
      },
      {
        batchId: 'bat2',
        productId: 'p1',
        qty: 2,
        expiresAtUtc: '9999-12-31T00:00:00.000Z',
      },
    ]);
  });

  it('carga componentes BOM', async () => {
    const db = mockDb({
      all: () => [{ child_product_id: 'c1', quantity: 2.5 }],
    });
    await expect(loadBomComponents(db, 't1', 'kit1')).resolves.toEqual([
      { componentProductId: 'c1', qtyPerKit: 2.5 },
    ]);
  });
});
