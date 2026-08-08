import { describe, expect, it } from 'vitest';
import { AtomicPlanBuilder, type D1Bound, type D1DatabaseLike } from './index.js';
import {
  appendSerialTransitionToPlan,
  hashSerialLeaseToken,
} from './process-inventory-serial-atomic.js';

function recordingDb(sql: string[]): D1DatabaseLike {
  return {
    prepare(statement) {
      sql.push(statement);
      const bound: D1Bound = {
        bind: () => bound,
        all: async () => ({ results: [], success: true, meta: {} }),
        first: async () => null,
        run: async () => ({ results: [], success: true, meta: {} }),
      };
      return { bind: () => bound };
    },
    batch: async () => [],
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

  it('appends guarded projection, immutable event and manifest to one plan', () => {
    const sql: string[] = [];
    const db = recordingDb(sql);
    const plan = new AtomicPlanBuilder(db, 'guard-serial');

    appendSerialTransitionToPlan(plan, db, {
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
  });

  it('rejects a transition without exact tenant and physical coordinates', () => {
    const sql: string[] = [];
    const db = recordingDb(sql);
    const plan = new AtomicPlanBuilder(db);
    expect(() =>
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
    ).toThrow('SERIAL_CONTEXT_REQUIRED');
  });
});
