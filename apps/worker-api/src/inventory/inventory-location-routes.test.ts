import { describe, expect, it, vi } from 'vitest';
import { processInventoryLocationTransferAtomic } from '@kipuspay/adapters-d1';
import {
  isInventoryLocationsEnabled,
  runCreateInventoryLocationHttp,
  runDeactivateInventoryLocationHttp,
  runInventoryLocationPickingHttp,
  runInventoryLocationStockHttp,
  runInventoryLocationTransferHttp,
  runListInventoryLocationsHttp,
  runUpdateInventoryLocationHttp,
} from './inventory-location-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  createInventoryLocationAtomic: vi.fn(() => Promise.resolve({ locationId: 'loc-1' })),
  updateInventoryLocationAtomic: vi.fn(() => Promise.resolve({ locationId: 'loc-1' })),
  deactivateInventoryLocationAtomic: vi.fn(() =>
    Promise.resolve({ locationId: 'loc-1', active: false }),
  ),
  processInventoryLocationTransferAtomic: vi.fn(() =>
    Promise.resolve({
      transferId: 'tr-1',
      sourceAfterMicrounits: 500_000,
      destinationAfterMicrounits: 500_000,
      alreadyApplied: false,
    }),
  ),
}));

function env(flag = '1'): WorkerEnv {
  const prepare = () => {
    const stmt = {
      bind: () => stmt,
      all: () =>
        Promise.resolve({
          results: [
            {
              location_id: 'loc-1',
              location_code: 'A-01',
              product_id: 'p1',
              batch_id: 'batch-1',
              expiration_date: '2026-12-01',
              quantity_microunits: 1_000_000,
            },
          ],
        }),
    };
    return stmt;
  };
  return {
    FEATURE_INVENTORY_LOCATIONS: flag,
    DB: { prepare },
  } as unknown as WorkerEnv;
}

describe('inventory-location-routes', () => {
  it('default off y feature-off 404', async () => {
    expect(isInventoryLocationsEnabled({} as WorkerEnv)).toBe(false);
    expect((await runListInventoryLocationsHttp(env('0'), 't1', 'cashier', {})).status).toBe(404);
  });

  it('CRUD y transfer requieren Admin/Owner', async () => {
    expect(
      (
        await runCreateInventoryLocationHttp(env(), 't1', 'u1', 'cashier', {
          branchId: 'b1',
          code: 'A-01',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await runCreateInventoryLocationHttp(env(), 't1', 'u1', 'admin', {
          branchId: 'b1',
          code: 'A-01',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await runUpdateInventoryLocationHttp(env(), 't1', 'u1', 'admin', {
          branchId: 'b1',
          locationId: 'loc-1',
          code: 'A-02',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await runDeactivateInventoryLocationHttp(env(), 't1', 'u1', 'owner', {
          branchId: 'b1',
          locationId: 'loc-1',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await runInventoryLocationTransferHttp(env(), 't1', 'u1', 'owner', {
          branchId: 'b1',
          sourceLocationId: 'loc-a',
          destinationLocationId: 'loc-b',
          productId: 'p1',
          quantityMicrounits: 500_000,
          idempotencyKey: 'idem-1',
        })
      ).status,
    ).toBe(200);
  });

  it('lecturas operativas permiten cashier y filtran tenant JWT', async () => {
    const locations = await runListInventoryLocationsHttp(env(), 'tenant-jwt', 'cashier', {
      branchId: 'b1',
    });
    const stock = await runInventoryLocationStockHttp(env(), 'tenant-jwt', 'cashier', {
      branchId: 'b1',
    });
    const picking = await runInventoryLocationPickingHttp(env(), 'tenant-jwt', 'cashier', {
      branchId: 'b1',
      productId: 'p1',
      quantityMicrounits: 500_000,
    });
    expect(locations.status).toBe(200);
    expect(stock.status).toBe(200);
    expect(picking.status).toBe(200);
  });
});

describe('US-01 transfer: coerción hostil sobre quantityMicrounits (fail-closed)', () => {
  it.each([
    ['null (Number→0: escribía 0 microunits)', null],
    ['undefined', undefined],
    ['[] (Number→0: escribía 0 microunits)', []],
    ['true (Number→1: escribía cantidad 1)', true],
    ["'0x10' (Number→16)", '0x10'],
    ["'' (Number→0)", ''],
    ['{} (Number→NaN)', {}],
    ['0 (el isSafeInteger atómico no cubre ≤0)', 0],
    ['-1 (negativa)', -1],
    ['1.5 (no entera)', 1.5],
  ])('%s → 400 estable sin consumir idempotencyKey', async (_label, hostile) => {
    const atomic = vi.mocked(processInventoryLocationTransferAtomic);
    atomic.mockClear();
    const res = await runInventoryLocationTransferHttp(env(), 't1', 'u1', 'owner', {
      branchId: 'b1',
      sourceLocationId: 'loc-a',
      destinationLocationId: 'loc-b',
      productId: 'p1',
      batchId: null,
      quantityMicrounits: hostile,
      idempotencyKey: 'idem-hostil',
    });
    expect(res.status).toBe(400);
    expect(['INVALID_QUANTITY', 'QUANTITY_OUT_OF_RANGE']).toContain(res.body.code);
    // La atómica jamás se invoca: la key de idempotencia no se consume con una
    // escritura de 0/1 microunits que el cliente nunca envió.
    expect(atomic).not.toHaveBeenCalled();
  });

  it('microunits grandes pasan exactos a la atómica (sin drift de float)', async () => {
    const atomic = vi.mocked(processInventoryLocationTransferAtomic);
    atomic.mockClear();
    const big = 900_719_925_474_091;
    const res = await runInventoryLocationTransferHttp(env(), 't1', 'u1', 'owner', {
      branchId: 'b1',
      sourceLocationId: 'loc-a',
      destinationLocationId: 'loc-b',
      productId: 'p1',
      batchId: null,
      quantityMicrounits: big,
      idempotencyKey: 'idem-big',
    });
    expect(res.status).toBe(200);
    const call = atomic.mock.calls[0];
    const input = call?.[3] as { quantityMicrounits: number };
    expect(input.quantityMicrounits).toBe(big);
  });
});

describe('US-01 picking: query cruda sin Number() (index.ts reenvía el string tal cual)', () => {
  it.each([
    ["'0x10' (antes Number→16 pasaba el isSafeInteger)", '0x10'],
    ["'1e3' (exponencial)", '1e3'],
    ["'+5' (signo)", '+5'],
    ["'-5' (negativa)", '-5'],
    ["'007' (cero a la izquierda)", '007'],
    ["'' (vacío)", ''],
    ['null', null],
    ['undefined (query ausente)', undefined],
    ['true (tipo hostil)', true],
    [0, 0],
    [-500_000, -500_000],
  ])('quantityMicrounits %s → 400 BAD_REQUEST', async (_label, hostile) => {
    const res = await runInventoryLocationPickingHttp(env(), 'tenant-jwt', 'cashier', {
      branchId: 'b1',
      productId: 'p1',
      quantityMicrounits: hostile,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it("'500000' textual canónico → 200 (la ruta lo parsea tipado, sin coerción)", async () => {
    const res = await runInventoryLocationPickingHttp(env(), 'tenant-jwt', 'cashier', {
      branchId: 'b1',
      productId: 'p1',
      quantityMicrounits: '500000',
    });
    expect(res.status).toBe(200);
  });
});
