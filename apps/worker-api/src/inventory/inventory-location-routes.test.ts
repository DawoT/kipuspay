import { describe, expect, it, vi } from 'vitest';
import {
  isInventoryLocationsEnabled,
  runCreateInventoryLocationHttp,
  runInventoryLocationPickingHttp,
  runInventoryLocationStockHttp,
  runInventoryLocationTransferHttp,
  runListInventoryLocationsHttp,
} from './inventory-location-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  createInventoryLocationAtomic: vi.fn(() => Promise.resolve({ locationId: 'loc-1' })),
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
