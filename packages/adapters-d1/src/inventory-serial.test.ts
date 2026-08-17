import { describe, expect, it } from 'vitest';
import { AtomicPlanBuilder, type D1Bound, type D1DatabaseLike } from './index.js';
import {
  acquireSerialLeaseAtomic,
  appendSerialTransitionToPlan,
  assertSerialSelectionCoverage,
  configureSerialTrackingAtomic,
  createSerialManifestAtomic,
  disposeSerialAtomic,
  hashSerialLeaseToken,
  loadSerialsForStockOperation,
  processInventorySerialCountAtomic,
  processInventorySerialLossAtomic,
  releaseSerialLeaseAtomic,
} from './process-inventory-serial-atomic.js';

function recordingDb(sql: string[]): D1DatabaseLike {
  return {
    prepare(statement) {
      sql.push(statement);
      const bound: D1Bound = {
        bind: () => bound,
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      };
      return { bind: () => bound };
    },
    batch: () => Promise.resolve([]),
  };
}

function scriptedDb(
  first: (sql: string, params: readonly unknown[]) => unknown = () => null,
  all: (sql: string, params: readonly unknown[]) => readonly unknown[] = () => [],
): D1DatabaseLike {
  return {
    prepare(statement) {
      let params: readonly unknown[] = [];
      const bound: D1Bound = {
        bind: (...values) => {
          params = values;
          return bound;
        },
        all: <T>() =>
          Promise.resolve({
            results: all(statement, params) as readonly T[],
            success: true,
            meta: {},
          }),
        first: <T>() => Promise.resolve(first(statement, params) as T | null),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      };
      return { bind: (...values) => bound.bind(...values) };
    },
    batch: (statements) =>
      Promise.resolve(statements.map(() => ({ results: [], success: true, meta: {} }))),
  };
}

describe('inventory serial atomic plan', () => {
  it('hashes opaque lease tokens without persisting the bearer secret', async () => {
    const first = await hashSerialLeaseToken('lease-secret-a');
    const second = await hashSerialLeaseToken('lease-secret-a');
    expect(first).toBe(second);
    expect(first).not.toContain('lease-secret-a');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('appends guarded projection, immutable event, audit and manifest to one plan', async () => {
    const sql: string[] = [];
    const db = recordingDb(sql);
    const plan = new AtomicPlanBuilder(db, 'guard-serial');

    await appendSerialTransitionToPlan(plan, db, {
      tenantId: 'tenant-a',
      serialId: 'serial-a',
      branchId: 'branch-a',
      locationId: 'location-a',
      productId: 'product-a',
      expectedStatus: 'AVAILABLE',
      nextStatus: 'SOLD',
      expectedVersion: 3,
      eventType: 'SALE',
      operationType: 'SALE_ITEM',
      operationId: 'sale-a',
      operationLineId: 'sale-item-a',
      idempotencyKey: 'sale-a:serial-a',
      actorUserId: 'user-a',
    });

    expect(sql.some((statement) => statement.includes('UPDATE serial_numbers'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO serial_number_events'))).toBe(
      true,
    );
    expect(sql.some((statement) => statement.includes('INSERT INTO serial_manifests'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO audit_events'))).toBe(true);
    expect(
      sql.find((statement) => statement.includes('INSERT INTO serial_manifest_items')),
    ).toContain('NOT EXISTS');
  });

  it('rejects a transition without exact tenant and physical coordinates', async () => {
    const sql: string[] = [];
    const db = recordingDb(sql);
    const plan = new AtomicPlanBuilder(db);
    await expect(
      appendSerialTransitionToPlan(plan, db, {
        tenantId: '',
        serialId: 'serial-a',
        branchId: 'branch-a',
        locationId: 'location-a',
        productId: 'product-a',
        expectedStatus: 'AVAILABLE',
        nextStatus: 'SOLD',
        expectedVersion: 1,
        eventType: 'SALE',
        operationType: 'SALE_ITEM',
        operationId: 'sale-a',
        operationLineId: 'sale-item-a',
        idempotencyKey: 'sale-a:serial-a',
        actorUserId: 'user-a',
      }),
    ).rejects.toThrow('SERIAL_CONTEXT_REQUIRED');
  });

  it.each([
    ['RESERVED', 'AVAILABLE', 'LAYAWAY_CANCEL'],
    ['AVAILABLE', 'IN_TRANSIT', 'TRANSFER_SHIP'],
    ['SOLD', 'RETURNED_INSPECTION', 'RETURNED'],
    ['AVAILABLE', 'RETURNED_SUPPLIER', 'SUPPLIER_RETURN'],
    ['AVAILABLE', 'LOST', 'COUNT_LOSS'],
  ])('plans %s -> %s for %s without escaping the tenant guard', async (from, to, eventType) => {
    const sql: string[] = [];
    const db = recordingDb(sql);
    const plan = new AtomicPlanBuilder(db);
    await appendSerialTransitionToPlan(plan, db, {
      tenantId: 'tenant-a',
      serialId: 'serial-a',
      branchId: 'branch-a',
      locationId: 'location-a',
      productId: 'product-a',
      expectedStatus: from,
      nextStatus: to,
      expectedVersion: 1,
      eventType,
      operationType: eventType,
      operationId: 'operation-a',
      operationLineId: 'line-a',
      idempotencyKey: `${eventType}:serial-a`,
      actorUserId: 'user-a',
    });
    const projection = sql.find((statement) => statement.includes('UPDATE serial_numbers'));
    expect(projection).toContain('tenant_id = ?');
    expect(projection).toContain('branch_id = ?');
    expect(projection).toContain('location_id = ?');
    expect(projection).toContain('product_id = ?');
    expect(projection).toContain('version = ?');
  });

  it('rejects lifecycle transitions outside the canonical matrix', async () => {
    const db = recordingDb([]);
    const plan = new AtomicPlanBuilder(db);
    await expect(
      appendSerialTransitionToPlan(plan, db, {
        tenantId: 'tenant-a',
        serialId: 'serial-a',
        branchId: 'branch-a',
        locationId: 'location-a',
        productId: 'product-a',
        expectedStatus: 'SOLD',
        nextStatus: 'AVAILABLE',
        expectedVersion: 1,
        eventType: 'INVALID',
        operationType: 'INVALID',
        operationId: 'operation-a',
        idempotencyKey: 'invalid:serial-a',
      }),
    ).rejects.toThrow('SERIAL_TRANSITION_INVALID');
  });

  it('exports the atomic serial command surface used by the Worker', () => {
    expect(configureSerialTrackingAtomic).toBeTypeOf('function');
    expect(createSerialManifestAtomic).toBeTypeOf('function');
    expect(acquireSerialLeaseAtomic).toBeTypeOf('function');
    expect(releaseSerialLeaseAtomic).toBeTypeOf('function');
    expect(disposeSerialAtomic).toBeTypeOf('function');
    expect(processInventorySerialCountAtomic).toBeTypeOf('function');
    expect(processInventorySerialLossAtomic).toBeTypeOf('function');
  });

  it('fails closed when serialized stock has no exact identity manifest', () => {
    expect(() =>
      assertSerialSelectionCoverage(new Map([['product-a', 'REQUIRED']]), [
        { productId: 'product-a', quantityMicrounits: 2_000_000, serialIds: [] },
      ]),
    ).toThrow('SERIAL_MANIFEST_REQUIRED');
  });

  it('loads product modes and serial identities in two preflight queries', async () => {
    const sql: string[] = [];
    const db: D1DatabaseLike = {
      prepare(statement) {
        sql.push(statement);
        let params: readonly unknown[] = [];
        const bound: D1Bound = {
          bind: (...values) => {
            params = values;
            return bound;
          },
          all: <T>() => {
            const rows = statement.includes('serial_tracking_mode')
              ? [{ id: 'product-a', serial_tracking_mode: 'REQUIRED' }]
              : [
                  {
                    id: 'serial-a',
                    product_id: 'product-a',
                    branch_id: 'branch-a',
                    location_id: 'location-a',
                    status: 'AVAILABLE',
                    version: 1,
                  },
                  {
                    id: 'serial-b',
                    product_id: 'product-a',
                    branch_id: 'branch-a',
                    location_id: 'location-a',
                    status: 'AVAILABLE',
                    version: 2,
                  },
                ];
            expect(params[0]).toBe('tenant-a');
            return Promise.resolve({ results: rows as T[], success: true, meta: {} });
          },
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return { bind: (...values) => bound.bind(...values) };
      },
      batch: () => Promise.resolve([]),
    };

    await expect(
      loadSerialsForStockOperation(
        db,
        'tenant-a',
        'branch-a',
        [
          {
            productId: 'product-a',
            quantityMicrounits: 2_000_000,
            serialIds: ['serial-a', 'serial-b'],
          },
        ],
        'AVAILABLE',
      ),
    ).resolves.toHaveLength(2);
    expect(sql).toHaveLength(2);
  });

  it('rejects duplicate identities and fractional serialized quantities', () => {
    const modes = new Map([['product-a', 'REQUIRED']]);
    expect(() =>
      assertSerialSelectionCoverage(modes, [
        {
          productId: 'product-a',
          quantityMicrounits: 2_000_000,
          serialIds: ['serial-a', 'serial-a'],
        },
      ]),
    ).toThrow('SERIAL_DUPLICATE');
    expect(() =>
      assertSerialSelectionCoverage(modes, [
        { productId: 'product-a', quantityMicrounits: 500_000, serialIds: ['serial-a'] },
      ]),
    ).toThrow('SERIAL_QUANTITY_INVALID');
  });

  it('configures REQUIRED tracking through one guarded batch', async () => {
    const sql: string[] = [];
    await expect(
      configureSerialTrackingAtomic(recordingDb(sql), 'tenant-a', 'user-a', {
        productId: 'product-a',
        serialTrackingMode: 'REQUIRED',
      }),
    ).resolves.toEqual({ productId: 'product-a', serialTrackingMode: 'REQUIRED' });
    const guard = sql.find((statement) => statement.includes('INSERT INTO atomic_guards'));
    expect(guard).toContain('inventory_location_stock');
    expect(guard).toContain('serial_numbers');
  });

  it('rejects REQUIRED with an honest error when untracked stock exists', async () => {
    const db = scriptedDb((sql) =>
      sql.includes('SUM(s.quantity_microunits)') ? { qty: 2_000_000 } : null,
    );
    await expect(
      configureSerialTrackingAtomic(db, 'tenant-a', 'user-a', {
        productId: 'product-a',
        serialTrackingMode: 'REQUIRED',
      }),
    ).rejects.toThrow('SERIAL_STOCK_EXISTS');
  });

  it('creates an exact receipt manifest and rejects a duplicate before commit', async () => {
    const receipt = {
      id: 'line-a',
      product_id: 'product-a',
      quantity_microunits: 2_000_000,
      branch_id: 'branch-a',
      serial_tracking_mode: 'REQUIRED',
    };
    const db = scriptedDb((sql) => (sql.includes('SELECT prl.id') ? receipt : null));
    await expect(
      createSerialManifestAtomic(db, 'tenant-a', 'user-a', {
        branchId: 'branch-a',
        purchaseReceiptLineId: 'line-a',
        serialNumbers: ['SN-1', 'SN-2'],
      }),
    ).resolves.toMatchObject({ serialCount: 2 });
    await expect(
      createSerialManifestAtomic(db, 'tenant-a', 'user-a', {
        branchId: 'branch-a',
        purchaseReceiptLineId: 'line-a',
        serialNumbers: ['SN-1', ' sn-1 '],
      }),
    ).rejects.toThrow('SERIAL_DUPLICATE');
  });

  it('acquires an opaque lease and rejects replay or another terminal', async () => {
    const available = scriptedDb((sql) =>
      sql.includes('FROM serial_numbers') ? { id: 'serial-a', terminal_id: 'terminal-a' } : null,
    );
    await expect(
      acquireSerialLeaseAtomic(available, 'tenant-a', 'user-a', 'terminal-a', {
        serialId: 'serial-a',
        idempotencyKey: 'attempt-a',
      }),
    ).resolves.toMatchObject({ replayed: false });

    const replay = scriptedDb((sql) =>
      sql.includes('FROM serial_terminal_leases')
        ? { id: 'lease-a', terminal_id: 'terminal-a', status: 'ACTIVE' }
        : null,
    );
    await expect(
      acquireSerialLeaseAtomic(replay, 'tenant-a', 'user-a', 'terminal-a', {
        serialId: 'serial-a',
        idempotencyKey: 'attempt-a',
      }),
    ).rejects.toThrow('SERIAL_LEASE_REPLAY');
    await expect(
      acquireSerialLeaseAtomic(replay, 'tenant-a', 'user-a', 'terminal-b', {
        serialId: 'serial-a',
        idempotencyKey: 'attempt-b',
      }),
    ).rejects.toThrow('SERIAL_LEASED_BY_OTHER_TERMINAL');

    const released = scriptedDb((sql) => {
      if (sql.includes('FROM serial_terminal_leases')) {
        return { id: 'lease-a', terminal_id: 'terminal-a', status: 'RELEASED' };
      }
      return sql.includes('FROM serial_numbers')
        ? { id: 'serial-a', terminal_id: 'terminal-b' }
        : null;
    });
    await expect(
      acquireSerialLeaseAtomic(released, 'tenant-a', 'user-a', 'terminal-b', {
        serialId: 'serial-a',
        idempotencyKey: 'attempt-c',
      }),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('releases, disposes, counts and records loss through guarded plans', async () => {
    const serialRow = {
      id: 'serial-a',
      branch_id: 'branch-a',
      location_id: 'location-a',
      product_id: 'product-a',
      status: 'RETURNED_INSPECTION',
      version: 2,
    };
    await expect(
      releaseSerialLeaseAtomic(scriptedDb(), 'tenant-a', 'terminal-a', {
        serialId: 'serial-a',
        leaseToken: 'opaque-token',
      }),
    ).resolves.toEqual({ serialId: 'serial-a', status: 'RELEASED' });
    await expect(
      disposeSerialAtomic(
        scriptedDb(() => serialRow),
        'tenant-a',
        'user-a',
        { serialId: 'serial-a', disposition: 'RETURN_TO_STOCK' },
      ),
    ).resolves.toEqual({ serialId: 'serial-a', status: 'AVAILABLE' });
    await expect(
      processInventorySerialLossAtomic(
        scriptedDb(() => ({ ...serialRow, status: 'AVAILABLE' })),
        'tenant-a',
        'user-a',
        { serialId: 'serial-a', reason: 'missing' },
      ),
    ).resolves.toEqual({ serialId: 'serial-a', status: 'LOST' });
    await expect(
      processInventorySerialCountAtomic(
        scriptedDb(undefined, () => [
          { id: 'serial-a', version: 2 },
          { id: 'serial-b', version: 1 },
        ]),
        'tenant-a',
        'user-a',
        {
          countId: 'count-a',
          branchId: 'branch-a',
          locationId: 'location-a',
          productId: 'product-a',
          observedSerialIds: ['serial-a'],
        },
      ),
    ).resolves.toEqual({ countId: 'count-a', lostSerialIds: ['serial-b'] });
  });
});
