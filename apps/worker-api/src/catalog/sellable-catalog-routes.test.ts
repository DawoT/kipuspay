import { describe, expect, it } from 'vitest';
import { runListSellableCatalogHttp } from './sellable-catalog-routes.js';

type Row = Record<string, unknown>;

function mockEnv(rows: Row[]): { FEATURE_CATALOG_SELLABLE: string; DB: unknown } {
  const db = {
    prepare() {
      const stmt = {
        bind() {
          return stmt;
        },
        all: () => Promise.resolve({ results: rows }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ success: true, meta: {} }),
      };
      return stmt;
    },
  };
  return { FEATURE_CATALOG_SELLABLE: '1', DB: db };
}

function productRow(overrides: Row = {}): Row {
  return {
    id: 'p1',
    sku: 'SKU-1',
    barcode: '1234567890128',
    name: 'Arroz 5kg',
    product_type: 'physical',
    price_cents: 1800,
    cost_cents: 1400,
    variant_price_override_cents: null,
    parent_product_id: null,
    charges_icbper: 0,
    list_price_cents: null,
    parent_list_price_cents: null,
    stock_microunits: 5_000_000,
    uom_code: 'UN',
    ...overrides,
  };
}

describe('Sprint C1 sellable catalog routes', () => {
  it('capability off → 404 FEATURE_OFF', async () => {
    const result = await runListSellableCatalogHttp(undefined, 't1', 'b1');
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('FEATURE_OFF');
  });

  it('sin tenant → 401', async () => {
    const result = await runListSellableCatalogHttp(mockEnv([]) as never, '', 'b1');
    expect(result.status).toBe(401);
  });

  it('sin DB → 503', async () => {
    const result = await runListSellableCatalogHttp(
      { FEATURE_CATALOG_SELLABLE: '1' } as never,
      't1',
      'b1',
    );
    expect(result.status).toBe(503);
  });

  it('precio de lista de la sucursal gana sobre el precio del catálogo', async () => {
    const env = mockEnv([productRow({ list_price_cents: 1950 })]);
    const result = await runListSellableCatalogHttp(env as never, 't1', 'b1');
    expect(result.status).toBe(200);
    const items = result.body.items as { unitPriceCents: number; productId: string }[];
    expect(items).toHaveLength(1);
    expect(items[0] ?? null).toMatchObject({ productId: 'p1', unitPriceCents: 1950 });
  });

  it('sin lista: cae al precio del catálogo', async () => {
    const env = mockEnv([productRow()]);
    const result = await runListSellableCatalogHttp(env as never, 't1', 'b1');
    const items = result.body.items as { unitPriceCents: number }[];
    expect(items[0]?.unitPriceCents).toBe(1800);
  });

  it('variante: el override gana sobre la lista del padre', async () => {
    const env = mockEnv([
      productRow({
        id: 'v1',
        parent_product_id: 'p1',
        variant_price_override_cents: 2200,
        list_price_cents: 2100,
        parent_list_price_cents: 2000,
      }),
    ]);
    const result = await runListSellableCatalogHttp(env as never, 't1', 'b1');
    const items = result.body.items as { unitPriceCents: number }[];
    expect(items[0]?.unitPriceCents).toBe(2200);
  });

  it('variante sin override ni listas: precio de catálogo propio', async () => {
    const env = mockEnv([
      productRow({ id: 'v1', parent_product_id: 'p1', variant_price_override_cents: null }),
    ]);
    const result = await runListSellableCatalogHttp(env as never, 't1', 'b1');
    const items = result.body.items as { unitPriceCents: number }[];
    expect(items[0]?.unitPriceCents).toBe(1800);
  });

  it('expone stock en microunits y UOM base', async () => {
    const env = mockEnv([productRow({ stock_microunits: 2500000, uom_code: 'KG' })]);
    const result = await runListSellableCatalogHttp(env as never, 't1', 'b1');
    const items = result.body.items as { stockMicrounits: number; uomCode: string }[];
    expect(items[0] ?? null).toMatchObject({ stockMicrounits: 2500000, uomCode: 'KG' });
  });
});
