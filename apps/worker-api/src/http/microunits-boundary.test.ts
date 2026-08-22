import { describe, expect, it } from 'vitest';

import type { WorkerEnv } from '../auth/control-plane.js';
import {
  runInventoryLocationPickingHttp,
  runInventoryLocationTransferHttp,
} from '../inventory/inventory-location-routes.js';
import { runCreateLayawayHttp } from '../sales/layaway-routes.js';
import { runCreateQuoteHttp } from '../sales/quote-routes.js';
import { runCreateSupplierReturnHttp } from '../purchasing/supplier-return-routes.js';
import {
  MICROUNITS_BOUNDARY_FIXTURE,
  microunitsErrorResult,
  parseMicrounits,
} from './microunits-input.js';

/**
 * US-03 — Matriz de frontera canónica: un parser, cinco sitios, veredictos
 * idénticos. La fixture compartida (MICROUNITS_BOUNDARY_FIXTURE) fija el
 * veredicto de cada insumo de frontera; este test exige que los cinco
 * sitios que antes coaccionaban con Number() crudo den hoy el MISMO
 * veredicto fail-closed: 400 estable con el motivo como código.
 */

/** Stmt/DB maniquí: los rechazos ocurren antes de tocar DB y los caminos
 * válidos solo deben llegar a un "no encontrado" de negocio, nunca a un
 * crash del maniquí. */
const dummyStmt = {
  bind: () => dummyStmt,
  first: () => Promise.resolve(null),
  all: () => Promise.resolve({ results: [], success: true, meta: {} }),
  run: () => Promise.resolve({ success: true }),
};

function env(flags: Record<string, string>): WorkerEnv {
  return {
    ...flags,
    DB: { prepare: () => dummyStmt, batch: () => Promise.resolve([]) },
  } as unknown as WorkerEnv;
}

interface MicrounitsSite {
  name: string;
  /** Casos de la fixture que aplican a este sitio (picking excluye el
   * ausente: conserva su default legacy 0). */
  applies: (value: unknown) => boolean;
  run: (value: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
}

const SITES: readonly MicrounitsSite[] = [
  {
    name: 'quote-routes.runCreateQuoteHttp (enteredQuantityMicrounits)',
    applies: () => true,
    run: (value) =>
      runCreateQuoteHttp(env({ FEATURE_SALES_QUOTES: '1' }), 't1', 'u1', {
        branchId: 'b1',
        items: [{ productId: 'p1', uomId: 'uom-pza', enteredQuantityMicrounits: value }],
      }),
  },
  {
    name: 'layaway-routes.runCreateLayawayHttp (enteredQuantityMicrounits)',
    applies: () => true,
    run: (value) =>
      runCreateLayawayHttp(env({ FEATURE_SALES_LAYAWAY: '1' }), 't1', 'u1', {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: value }],
      }),
  },
  {
    name: 'supplier-return-routes.runCreateSupplierReturnHttp (enteredQuantityMicrounits)',
    applies: () => true,
    run: (value) =>
      runCreateSupplierReturnHttp(env({ FEATURE_PURCHASING_RETURNS: '1' }), 't1', 'u1', {
        purchaseReceiptId: 'r1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: value }],
      }),
  },
  {
    name: 'inventory-location-routes transfer (quantityMicrounits)',
    applies: () => true,
    run: (value) =>
      runInventoryLocationTransferHttp(
        env({ FEATURE_INVENTORY_LOCATIONS: '1' }),
        't1',
        'u1',
        'admin',
        {
          branchId: 'b1',
          sourceLocationId: 'l1',
          destinationLocationId: 'l2',
          productId: 'p1',
          quantityMicrounits: value,
          idempotencyKey: 'k1',
        },
      ),
  },
  {
    name: 'picking vía index.ts → runInventoryLocationPickingHttp (query string crudo)',
    applies: (value) => value !== undefined,
    run: (value) =>
      runInventoryLocationPickingHttp(
        env({ FEATURE_INVENTORY_LOCATIONS: '1' }),
        't1',
        'cashier',
        { branchId: 'b1', productId: 'p1', quantityMicrounits: value },
      ),
  },
];

const INVALID_CASES = MICROUNITS_BOUNDARY_FIXTURE.filter((c) => !c.ok);
const VALID_CASES = MICROUNITS_BOUNDARY_FIXTURE.filter((c) => c.ok);

describe('parseMicrounits — fixture de frontera canónica (US-03)', () => {
  for (const testCase of MICROUNITS_BOUNDARY_FIXTURE) {
    it(`${testCase.ok ? 'acepta' : 'rechaza fail-closed'}: ${testCase.name}`, () => {
      const result = parseMicrounits(testCase.value);
      if (testCase.ok) {
        expect(result).toEqual({ ok: true, microunits: testCase.microunits });
      } else {
        expect(result).toEqual({ ok: false, errorName: testCase.errorName });
      }
    });
  }

  it('fija las desviaciones que la coerción Number() aceptaba en silencio', () => {
    // true→1, [5]→5, '+1'→1 y ' 42 '→42 eran cantidades "válidas"; hoy son
    // rechazos tipados estables, fijados por la propia fixture arriba y
    // repetidos aquí como contrato explícito.
    expect(parseMicrounits(true)).toEqual({ ok: false, errorName: 'MICROUNITS_INVALID' });
    expect(parseMicrounits([5])).toEqual({ ok: false, errorName: 'MICROUNITS_INVALID' });
    expect(parseMicrounits('+1')).toEqual({ ok: false, errorName: 'MICROUNITS_INVALID' });
    expect(parseMicrounits(' 42 ')).toEqual({ ok: false, errorName: 'MICROUNITS_INVALID' });
  });

  it('microunitsErrorResult produce el 400 estable compartido por los cinco sitios', () => {
    expect(microunitsErrorResult('MICROUNITS_INVALID')).toEqual({
      status: 400,
      body: { error: 'MICROUNITS_INVALID', code: 'MICROUNITS_INVALID' },
    });
    expect(microunitsErrorResult('MICROUNITS_OUT_OF_RANGE')).toEqual({
      status: 400,
      body: { error: 'MICROUNITS_OUT_OF_RANGE', code: 'MICROUNITS_OUT_OF_RANGE' },
    });
  });
});

describe('US-03 matriz cross-site: un parser, cinco sitios, veredictos idénticos', () => {
  for (const site of SITES) {
    it(`${site.name}: mismo 400 estable para cada tipo inválido de la fixture`, async () => {
      for (const testCase of INVALID_CASES) {
        if (!site.applies(testCase.value)) continue;
        const result = await site.run(testCase.value);
        expect(result.status, `${site.name} con ${testCase.name}`).toBe(400);
        expect(result.body.code, `${site.name} con ${testCase.name}`).toBe(testCase.errorName);
        expect(result.body.error, `${site.name} con ${testCase.name}`).toBe(testCase.errorName);
      }
    });

    it(`${site.name}: ningún valor válido de la fixture es rechazado como tipo inválido`, async () => {
      for (const testCase of VALID_CASES) {
        if (!site.applies(testCase.value)) continue;
        const result = await site.run(testCase.value);
        // El veredicto posterior puede ser negocio (200/4xx), pero jamás un
        // 400 MICROUNITS_*: la validación tipada solo juzga forma.
        expect(String(result.body.code), `${site.name} con ${testCase.name}`).not.toMatch(
          /^MICROUNITS_/,
        );
      }
    });
  }

  it('los cinco sitios emiten el mismo par (status, code) caso por caso', async () => {
    for (const testCase of INVALID_CASES) {
      const applicable = SITES.filter((site) => site.applies(testCase.value));
      const verdicts = await Promise.all(
        applicable.map(async (site) => {
          const result = await site.run(testCase.value);
          return `${result.status}:${String(result.body.code)}`;
        }),
      );
      expect(
        new Set(verdicts).size,
        `${testCase.name}: veredictos divergentes ${verdicts.join(' | ')}`,
      ).toBe(1);
    }
  });

  it('picking: parámetro ausente conserva el default legacy 0 → 400 BAD_REQUEST', async () => {
    const result = await SITES[4]!.run(undefined);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('BAD_REQUEST');
  });
});
