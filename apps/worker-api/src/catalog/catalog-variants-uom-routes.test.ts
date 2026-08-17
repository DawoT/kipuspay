import { describe, expect, it } from 'vitest';
import {
  runListVariantsUomHttp,
  runUpsertProductUomHttp,
  runUpdateVariantHttp,
} from './catalog-variants-uom-routes.js';

type Row = Record<string, unknown>;

function mockEnv(overrides: {
  products?: Row[];
  /** mapa id → fila para las consultas por id (target y parent). */
  byId?: Record<string, Row | null | undefined>;
  children?: Row | null;
  uoms?: Row[];
}): { FEATURE_CATALOG_VARIANTS: string; FEATURE_CATALOG_UOM: string; DB: unknown } {
  const byId = overrides.byId ?? {};
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        first: () => {
          if (sql.includes('WHERE tenant_id = ? AND parent_product_id = ?')) {
            return Promise.resolve(overrides.children ?? null);
          }
          if (sql.includes('WHERE tenant_id = ? AND id = ?')) {
            return Promise.resolve(byId[String(args[1])] ?? null);
          }
          return Promise.resolve(null);
        },
        all: () => Promise.resolve({ results: overrides.uoms ?? [] }),
        run: () => Promise.resolve({ success: true, meta: {} }),
      };
      return stmt;
    },
    batch: (items: unknown[]) => Promise.resolve(items.map(() => ({ success: true, meta: {} }))),
  };
  return {
    FEATURE_CATALOG_VARIANTS: '1',
    FEATURE_CATALOG_UOM: '1',
    DB: db,
  };
}

describe('Sprint 31 variants/UOM routes', () => {
  it('defaults both capabilities off', async () => {
    const result = await runListVariantsUomHttp(undefined, 't1');
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('FEATURE_OFF');
  });

  it('validates normalized UOM input before D1', async () => {
    const result = await runUpsertProductUomHttp(
      { FEATURE_CATALOG_UOM: '1' } as never,
      't1',
      'u1',
      'ADMIN',
      { productId: 'p1', uomCode: '', factorNumerator: 1, factorDenominator: 1 },
    );
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('UOM_CODE_INVALID');
  });

  it('allows variant mutation with rol del JWT en minúscula (owner real)', async () => {
    const env = mockEnv({ byId: { 'p-leaf': { parent_product_id: null } }, children: {} });
    const result = await runUpdateVariantHttp(env as never, 't1', 'u1', 'owner', 'p-leaf', {
      parentProductId: 'parent',
    });
    expect(result.status).not.toBe(403);
  });

  it('rejects variant mutation outside Admin/Owner', async () => {
    const result = await runUpdateVariantHttp(
      { FEATURE_CATALOG_VARIANTS: '1' } as never,
      't1',
      'u1',
      'CASHIER',
      'p1',
      { parentProductId: 'parent' },
    );
    expect(result.status).toBe(403);
  });

  it('rejects nesting: product with children cannot become a variant', async () => {
    const env = mockEnv({
      byId: { 'p-has-children': { parent_product_id: null }, parent: { parent_product_id: null } },
      children: { id: 'child' },
    });
    const result = await runUpdateVariantHttp(env as never, 't1', 'u1', 'ADMIN', 'p-has-children', {
      parentProductId: 'parent',
    });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('VARIANT_NESTING_FORBIDDEN');
  });

  it('rejects nesting: parent product is itself a variant', async () => {
    const env = mockEnv({
      byId: { 'p-leaf': { parent_product_id: null }, 'p-parent': { parent_product_id: 'gp' } },
      children: null,
    });
    const result = await runUpdateVariantHttp(env as never, 't1', 'u1', 'ADMIN', 'p-leaf', {
      parentProductId: 'p-parent',
    });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('VARIANT_NESTING_FORBIDDEN');
  });

  it('rejects self-parent', async () => {
    const env = mockEnv({ byId: { 'p-self': { parent_product_id: null } }, children: null });
    const result = await runUpdateVariantHttp(env as never, 't1', 'u1', 'ADMIN', 'p-self', {
      parentProductId: 'p-self',
    });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('VARIANT_SELF_PARENT');
  });

  it('dedups list by product: one row per product regardless of UOM count', async () => {
    const env = mockEnv({
      uoms: [
        {
          id: 'p1',
          name: 'Camisa',
          uom_code: 'UNI',
          is_base: 1,
          uoms_json: '[]',
          variant_list_price_cents: 1000,
          parent_list_price_cents: null,
          variant_price_override_cents: null,
        },
        {
          id: 'p2',
          name: 'Polo',
          uom_code: 'CAJA',
          is_base: 0,
          uoms_json: '[]',
          variant_list_price_cents: 2000,
          parent_list_price_cents: 1800,
          variant_price_override_cents: null,
        },
      ],
    });
    const result = await runListVariantsUomHttp(env as never, 't1');
    expect(result.status).toBe(200);
    const items = result.body.items as {
      id: string;
      uoms: unknown[];
      uoms_json?: string;
      resolved_price_cents?: number;
    }[];
    expect(items.length).toBe(2);
    expect(items.every((i) => 'uoms' in i && i.uoms_json === undefined)).toBe(true);
    expect(items.every((i) => Number.isSafeInteger(i.resolved_price_cents))).toBe(true);
  });
});
