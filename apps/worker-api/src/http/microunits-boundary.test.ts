/**
 * US-05 — frontera HTTP de microunidades: los 5 sitios que coaccionaban con
 * Number() deben rechazar tipos inválidos con 400 estable ANTES de tocar D1
 * (fail-closed), y el costo derivado del conteo debe ser exacto en montos
 * grandes (BigInt + guard de rango, AC2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCreateLayawayHttp } from '../sales/layaway-routes.js';
import { runCreateQuoteHttp } from '../sales/quote-routes.js';
import { runCreateSupplierReturnHttp } from '../purchasing/supplier-return-routes.js';
import {
  deriveCountDiffValueCents,
  resolveCountedMicrounits,
  runSubmitCountReviewHttp,
} from '../inventory/inventory-ops-routes.js';
import {
  runInventoryLocationPickingHttp,
  runInventoryLocationTransferHttp,
} from '../inventory/inventory-location-routes.js';
import {
  processInventoryLocationTransferAtomic,
  processLayawayCreateAtomic,
  processQuoteCreateAtomic,
  processSupplierReturnCreateAtomic,
} from '@kipuspay/adapters-d1';
import type * as AdaptersD1 from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', async (importOriginal) => {
  const actual = await importOriginal<typeof AdaptersD1>();
  return {
    ...actual,
    processQuoteCreateAtomic: vi.fn(() =>
      Promise.resolve({
        quoteId: 'q1',
        snapshotTotalCents: 1000,
        emitsFiscalDocument: false,
        reservesStock: false,
      }),
    ),
    processLayawayCreateAtomic: vi.fn(() =>
      Promise.resolve({ layawayId: 'l1', status: 'ACTIVE' }),
    ),
    processSupplierReturnCreateAtomic: vi.fn(() =>
      Promise.resolve({ returnId: 'r1', status: 'DRAFT', totalCents: 0 }),
    ),
    processInventoryLocationTransferAtomic: vi.fn(() =>
      Promise.resolve({
        transferId: 'tr1',
        sourceAfterMicrounits: 0,
        destinationAfterMicrounits: 500_000,
        alreadyApplied: false,
      }),
    ),
  };
});

const QUANTITY_CODE = 'QUANTITY_MICROUNITS_INVALID';

function dbEnv(feature: string): WorkerEnv {
  return {
    [feature]: '1',
    DB: {
      prepare: () => {
        const stmt = {
          bind: () => stmt,
          first: () => Promise.resolve(null),
          all: () => Promise.resolve({ results: [] }),
          run: () => Promise.resolve({ success: true }),
        };
        return stmt;
      },
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
}

function countDbEnv(authority: Record<string, unknown>): WorkerEnv {
  const prepare = (_sql: string) => {
    const stmt = {
      bind: () => stmt,
      run: () => Promise.resolve({ success: true }),
      first: () =>
        Promise.resolve(
          _sql.includes('FROM inventory_counts')
            ? { status: 'COUNTING', branch_id: 'b1' }
            : authority,
        ),
      all: () => Promise.resolve({ results: [] }),
    };
    return stmt;
  };
  return {
    FEATURE_INVENTORY_BATCHES: '1',
    DB: { prepare, batch: () => Promise.resolve([]) },
  } as unknown as WorkerEnv;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('US-05 — tipos inválidos → 400 estable antes de D1 (5 sitios)', () => {
  const invalidCases = [
    ['NBSP string', '\u00A012'],
    ['espacios', ' 12 '],
    ['booleano', true],
    ['array', []],
  ] as const;

  it('cotización (quote)', async () => {
    for (const [, badQty] of invalidCases) {
      const res = await runCreateQuoteHttp(dbEnv('FEATURE_SALES_QUOTES'), 't1', 'u1', {
        branchId: 'b1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: badQty }],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(QUANTITY_CODE);
    }
    expect(processQuoteCreateAtomic).not.toHaveBeenCalled();
    // Canonical válido sigue su curso hacia el adaptador.
    await runCreateQuoteHttp(dbEnv('FEATURE_SALES_QUOTES'), 't1', 'u1', {
      branchId: 'b1',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
    });
    expect(processQuoteCreateAtomic).toHaveBeenCalledTimes(1);
  });

  it('apartado (layaway)', async () => {
    for (const [, badQty] of invalidCases) {
      const res = await runCreateLayawayHttp(dbEnv('FEATURE_SALES_LAYAWAY'), 't1', 'u1', {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: badQty }],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(QUANTITY_CODE);
    }
    expect(processLayawayCreateAtomic).not.toHaveBeenCalled();
  });

  it('devolución a proveedor', async () => {
    for (const [, badQty] of invalidCases) {
      const res = await runCreateSupplierReturnHttp(dbEnv('FEATURE_PURCHASING_RETURNS'), 't1', 'u1', {
        purchaseReceiptId: 'pr1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: badQty }],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(QUANTITY_CODE);
    }
    expect(processSupplierReturnCreateAtomic).not.toHaveBeenCalled();
  });

  it('transferencia entre ubicaciones', async () => {
    for (const [, badQty] of invalidCases) {
      const res = await runInventoryLocationTransferHttp(
        dbEnv('FEATURE_INVENTORY_LOCATIONS'),
        't1',
        'u1',
        'admin',
        {
          branchId: 'b1',
          sourceLocationId: 'loc-1',
          destinationLocationId: 'loc-2',
          productId: 'p1',
          quantityMicrounits: badQty,
          idempotencyKey: 'idem-1',
        },
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(QUANTITY_CODE);
    }
    expect(processInventoryLocationTransferAtomic).not.toHaveBeenCalled();
  });

  it('picking por ubicación (query cruda): dígito canónico pasa, basura → 400', async () => {
    for (const raw of [' 12 ', '\u00A012', 'abc', '007', '+5', undefined]) {
      const res = await runInventoryLocationPickingHttp(
        dbEnv('FEATURE_INVENTORY_LOCATIONS'),
        't1',
        'cashier',
        { branchId: 'b1', productId: 'p1', quantityMicrounits: raw },
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    }
    // Canónico '5000000': valida y avanza a la consulta de stock (sin stock →
    // 422 LOCATION_INSUFFICIENT_STOCK, jamás el 400 de query inválida).
    const ok = await runInventoryLocationPickingHttp(
      dbEnv('FEATURE_INVENTORY_LOCATIONS'),
      't1',
      'cashier',
      { branchId: 'b1', productId: 'p1', quantityMicrounits: '5000000' },
    );
    expect(ok.status).toBe(422);
    expect(ok.body.code).toBe('LOCATION_INSUFFICIENT_STOCK');
  });
});

describe('US-05 — conteo: regla única y costo derivado exacto', () => {
  it('resolveCountedMicrounits usa la MISMA regla única (AC3): true y " 12 " no son cantidad', () => {
    expect(resolveCountedMicrounits({ countedQtyMicrounits: true }).ok).toBe(false);
    expect(resolveCountedMicrounits({ countedQty: true }).ok).toBe(false);
    expect(resolveCountedMicrounits({ countedQty: ' 12 ' }).ok).toBe(false);
    // Antes: Math.round(true * 1_000_000) = 1_000_000 (fail-open).
    expect(resolveCountedMicrounits({ countedQty: 2.5 })).toEqual({ ok: true, microunits: 2_500_000 });
    expect(resolveCountedMicrounits({})).toEqual({ ok: true, microunits: 0 });
  });

  it('conteo con cantidad booleana → 422 COUNT_INVALID_QUANTITY sin tocar el batch', async () => {
    const res = await runSubmitCountReviewHttp(countDbEnv({}), 't1', 'owner', {
      countId: 'c1',
      lines: [{ productId: 'p1', countedQtyMicrounits: true }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUNT_INVALID_QUANTITY');
  });

  it('exactitud en montos grandes: el float antiguo corrompía 1 centavo, el exacto no', () => {
    // Producto 14_227_474_028_499_999 (> 2^53): Math.round float daba ...029.
    const res = deriveCountDiffValueCents(20_313_093, 700_409_043);
    expect(res).toEqual({ ok: true, diffValueCents: 14_227_474_028 });
    // Referencia BigInt independiente.
    const expected =
      (20_313_093n * 700_409_043n + 500_000n) / 1_000_000n;
    expect(BigInt((res as { diffValueCents: number }).diffValueCents)).toBe(expected);
  });

  it('semántica Math.round preservada en rango (half toward +∞, incl. negativos)', () => {
    const cases: [number, number][] = [
      [1_500_000, 1],
      [-1_500_000, 1],
      [-500_000, 1], // Math.round(-0.5) = -0 ≡ 0
      [2_499_999, 137],
      [-2_499_999, 137],
      [10_000_001, 99],
      [-10_000_001, 99],
    ];
    for (const [diff, cost] of cases) {
      const res = deriveCountDiffValueCents(diff, cost);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      // +0 normaliza el -0 de Math.round (Object.is distingue -0 de 0).
      expect(res.diffValueCents).toBe(Math.round((diff / 1_000_000) * cost) + 0);
    }
    const zero = deriveCountDiffValueCents(-500_000, 1);
    expect(zero.ok && zero.diffValueCents === 0).toBe(true);
  });

  it('guard de rango: producto fuera de safe-integer → COUNT_VALUE_OUT_OF_RANGE', () => {
    expect(deriveCountDiffValueCents(8_000_000_000_000, 2_000_000_000)).toEqual({
      ok: false,
      errorName: 'COUNT_VALUE_OUT_OF_RANGE',
    });
    expect(deriveCountDiffValueCents(-8_000_000_000_000, 2_000_000_000)).toEqual({
      ok: false,
      errorName: 'COUNT_VALUE_OUT_OF_RANGE',
    });
    expect(deriveCountDiffValueCents(Number.NaN, 100).ok).toBe(false);
  });

  it('route-level: diferencia valorizada enorme → 422 COUNT_VALUE_OUT_OF_RANGE estable', async () => {
    const res = await runSubmitCountReviewHttp(
      countDbEnv({ quantity_microunits: 0, pmp_unit_cost_cents: 2_000_000_000, location_id: 'loc-1' }),
      't1',
      'owner',
      { countId: 'c1', lines: [{ productId: 'p1', countedQtyMicrounits: 8_000_000_000_000 }] },
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUNT_VALUE_OUT_OF_RANGE');
  });

  it('route-level: bind usa el valor EXACTO precalculado (14_227_474_028)', async () => {
    const binds: unknown[][] = [];
    const env = countDbEnv({
      quantity_microunits: 0,
      pmp_unit_cost_cents: 700_409_043,
      location_id: 'loc-1',
    });
    const prepare = env.DB!.prepare.bind(env.DB);
    (env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = prepare(sql) as { bind: (...v: unknown[]) => unknown };
      return {
        bind: (...values: unknown[]) => {
          binds.push(values);
          return stmt.bind(...values);
        },
        run: () => Promise.resolve({ success: true }),
        first: () =>
          Promise.resolve(
            sql.includes('FROM inventory_counts')
              ? { status: 'COUNTING', branch_id: 'b1' }
              : { quantity_microunits: 0, pmp_unit_cost_cents: 700_409_043, location_id: 'loc-1' },
          ),
        all: () => Promise.resolve({ results: [] }),
      };
    };
    const res = await runSubmitCountReviewHttp(env, 't1', 'owner', {
      countId: 'c1',
      lines: [{ productId: 'p1', countedQtyMicrounits: 20_313_093 }],
    });
    expect(res.status).toBe(200);
    expect(binds.flat()).toContain(14_227_474_028);
    expect(binds.flat()).not.toContain(14_227_474_029);
  });
});
