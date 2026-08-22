import { describe, expect, it, vi } from 'vitest';
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
      // US-04: el query param llega crudo (string); la ruta valida tipado.
      quantityMicrounits: '500000',
    });
    expect(locations.status).toBe(200);
    expect(stock.status).toBe(200);
    expect(picking.status).toBe(200);
  });

  it('US-04: transfer con *Microunits de tipo inválido → 400 estable sin llamar al adapter', async () => {
    const { processInventoryLocationTransferAtomic } = await import('@kipuspay/adapters-d1');
    const callsBefore = vi.mocked(processInventoryLocationTransferAtomic).mock.calls.length;
    for (const bad of ['500000', true, null, [500_000], {}, NaN, 1.5]) {
      const res = await runInventoryLocationTransferHttp(env(), 't1', 'u1', 'owner', {
        branchId: 'b1',
        sourceLocationId: 'loc-a',
        destinationLocationId: 'loc-b',
        productId: 'p1',
        quantityMicrounits: bad,
        idempotencyKey: 'idem-us04',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'invalid quantity microunits',
        code: 'INVALID_QUANTITY_MICROUNITS',
      });
    }
    expect(vi.mocked(processInventoryLocationTransferAtomic).mock.calls.length).toBe(callsBefore);
  });

  it('US-04: picking valida el query tipado (sin coerción Number)', async () => {
    for (const bad of ['0x10', 'abc', '-5', '007', '1e3', '', undefined, '9007199254740992']) {
      const res = await runInventoryLocationPickingHttp(env(), 'tenant-jwt', 'cashier', {
        branchId: 'b1',
        productId: 'p1',
        quantityMicrounits: bad,
      });
      // Shape 400 preexistente conservado para la ruta GET.
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid picking query', code: 'BAD_REQUEST' });
    }
    const ok = await runInventoryLocationPickingHttp(env(), 'tenant-jwt', 'cashier', {
      branchId: 'b1',
      productId: 'p1',
      quantityMicrounits: '500000',
    });
    expect(ok.status).toBe(200);
  });
});
