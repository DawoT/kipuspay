import { describe, expect, it } from 'vitest';
import { runQuickAddHttp, runScanLookupHttp, type QuickAddEnv } from './quick-add-routes.js';

function mockDb(overrides: Partial<Record<string, unknown>> = {}): unknown {
  const first = (sql: string) => {
    if (sql.includes('FROM products')) {
      return overrides.product ?? null;
    }
    if (sql.includes('FROM users')) {
      return overrides.vendor ?? null;
    }
    if (sql.includes('row_hash')) {
      return null;
    }
    return null;
  };
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: () => Promise.resolve(first(sql)),
            run: () => Promise.resolve({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

function envWith(overrides: Partial<QuickAddEnv> = {}): QuickAddEnv {
  return {
    FEATURE_CATALOG_QUICK_ADD: '1',
    DB: mockDb(),
    ...overrides,
  };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'owner' };

describe('catalog.quick_add routes (Sprint 50)', () => {
  it('flag off → 404 FEATURE_OFF', async () => {
    const res = await runQuickAddHttp(envWith({ FEATURE_CATALOG_QUICK_ADD: '0' }), actor, {
      barcode: '1234567890128',
      name: 'Producto',
      priceCents: 1500,
    });
    expect(res.status).toBe(404);
  });

  it('rol no-owner → 403', async () => {
    const res = await runQuickAddHttp(
      envWith(),
      { ...actor, role: 'cashier' },
      {
        barcode: '1234567890128',
        name: 'P',
        priceCents: 100,
      },
    );
    expect(res.status).toBe(403);
  });

  it('EMP- como barcode de producto → 422 RESERVED_BARCODE', async () => {
    const res = await runQuickAddHttp(envWith(), actor, {
      barcode: 'EMP-12345',
      name: 'P',
      priceCents: 100,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RESERVED_BARCODE');
  });

  it('barcode no numérico → 422 UNSUPPORTED_BARCODE', async () => {
    const res = await runQuickAddHttp(envWith(), actor, {
      barcode: 'ABC-123',
      name: 'P',
      priceCents: 100,
    });
    expect(res.status).toBe(422);
  });

  it('producto existente → 200 sin duplicar (upsert por barcode)', async () => {
    const env = envWith();
    (env.DB as { prepare(sql: string): { bind(): unknown } }) = mockDb({
      product: {
        id: 'p1',
        sku: 'S1',
        barcode: '1234567890128',
        name: 'Existente',
        price_cents: 900,
        product_type: 'physical',
      },
    }) as never;
    const res = await runQuickAddHttp(env, actor, {
      barcode: '1234567890128',
      name: 'Existente',
      priceCents: 900,
    });
    expect(res.status).toBe(200);
    expect((res.body.product as { id: string }).id).toBe('p1');
    expect(res.body.created).toBe(false);
  });

  it('producto nuevo → 201 con audit QUICK_ADD', async () => {
    const res = await runQuickAddHttp(envWith(), actor, {
      barcode: '1234567890128',
      name: 'Nuevo',
      priceCents: 1500,
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
  });

  it('GET scan: dígitos → producto; EMP- → vendedor; otro → 422', async () => {
    const withProduct = envWith();
    (withProduct.DB as never) = mockDb({
      product: {
        id: 'p1',
        sku: 'S1',
        barcode: '1234567890128',
        name: 'P',
        price_cents: 900,
        product_type: 'physical',
      },
    }) as never;
    const product = await runScanLookupHttp(withProduct, actor, '1234567890128');
    expect(product.status).toBe(200);
    expect((product.body as { kind: string }).kind).toBe('product');

    const withVendor = envWith();
    (withVendor.DB as never) = mockDb({ vendor: { id: 'u9', name: 'Vendedor' } }) as never;
    const vendor = await runScanLookupHttp(withVendor, actor, 'EMP-12345');
    expect(vendor.status).toBe(200);
    expect((vendor.body as { kind: string }).kind).toBe('vendor');

    const bad = await runScanLookupHttp(envWith(), actor, 'ABC');
    expect(bad.status).toBe(422);
  });
});
