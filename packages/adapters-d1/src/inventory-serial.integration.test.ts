import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  acquireSerialLeaseAtomic,
  processInventoryLocationTransferAtomic,
  runD1AtomicPlan,
  appendSerialTransitionToPlan,
} from './index.js';

async function seedSerialFixture(suffix: string): Promise<{
  tenantId: string;
  branchId: string;
  userId: string;
  productId: string;
  serialId: string;
}> {
  const tenantId = `t-serial-${suffix}`;
  const branchId = `b-serial-${suffix}`;
  const userId = `u-serial-${suffix}`;
  const productId = `p-serial-${suffix}`;
  const serialId = `s-serial-${suffix}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Serial SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, ?, 'Serial', 'Lima')`,
    ).bind(branchId, tenantId, `SER-${suffix}`),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).bind(userId, tenantId, branchId, `${suffix}@example.com`),
    env.DB.prepare(
      `INSERT INTO products (
         id, tenant_id, sku, name, product_type, unit_code, price_cents,
         igv_affectation_code_default, stock, stock_microunits, serial_tracking_mode
       ) VALUES (?, ?, ?, 'Serial', 'physical', 'NIU', 100, '10', 1, 1000000, 'REQUIRED')`,
    ).bind(productId, tenantId, `SKU-${suffix}`),
    env.DB.prepare(
      `INSERT INTO inventory_locations (id, tenant_id, branch_id, code)
       VALUES (?, ?, ?, 'DEFAULT')`,
    ).bind(`loc-default:${tenantId}:${branchId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO inventory_location_stock (
         tenant_id, branch_id, location_id, product_id, quantity_microunits
       ) VALUES (?, ?, ?, ?, 1000000)`,
    ).bind(tenantId, branchId, `loc-default:${tenantId}:${branchId}`, productId),
    env.DB.prepare(
      `INSERT INTO branch_product_stock (
         tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents
       ) VALUES (?, ?, ?, 1, 1000000, 50)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO serial_numbers (
         id, tenant_id, branch_id, location_id, product_id, serial_number,
         serial_number_normalized, status, version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', 1)`,
    ).bind(
      serialId,
      tenantId,
      branchId,
      `loc-default:${tenantId}:${branchId}`,
      productId,
      `SN-${suffix}`,
      `SN-${suffix}`.toUpperCase(),
    ),
  ]);
  return { tenantId, branchId, userId, productId, serialId };
}

describe('inventory serial ACID', () => {
  it('allows exactly one concurrent terminal lease winner', async () => {
    const fixture = await seedSerialFixture('lease-race');
    await env.DB.batch(
      ['terminal-a', 'terminal-b'].map((terminalId) =>
        env.DB.prepare(
          `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
           VALUES (?, ?, ?, ?)`,
        ).bind(terminalId, fixture.tenantId, fixture.branchId, terminalId),
      ),
    );
    const outcomes = await Promise.allSettled(
      ['terminal-a', 'terminal-b'].map((terminalId) =>
        acquireSerialLeaseAtomic(env.DB, fixture.tenantId, fixture.userId, terminalId, {
          serialId: fixture.serialId,
          idempotencyKey: `lease:${terminalId}`,
        }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  });

  it('rejects a terminal from another branch before leasing the serial', async () => {
    const fixture = await seedSerialFixture('lease-branch');
    const foreignBranchId = `${fixture.branchId}-foreign`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'SER-FOREIGN', 'Foreign', 'Lima')`,
      ).bind(foreignBranchId, fixture.tenantId),
      env.DB.prepare(
        `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
         VALUES ('terminal-foreign', ?, ?, 'Foreign')`,
      ).bind(fixture.tenantId, foreignBranchId),
    ]);

    await expect(
      acquireSerialLeaseAtomic(env.DB, fixture.tenantId, fixture.userId, 'terminal-foreign', {
        serialId: fixture.serialId,
        idempotencyKey: 'lease:foreign',
      }),
    ).rejects.toThrow(/SERIAL_TERMINAL_BRANCH_INVALID/);
  });

  it('moves one exact identity with its location stock and rejects stale replay', async () => {
    const fixture = await seedSerialFixture('location');
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO inventory_locations (id, tenant_id, branch_id, code)
         VALUES ('loc-destination', ?, ?, 'DEST')`,
      ).bind(fixture.tenantId, fixture.branchId),
      env.DB.prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES ('audit-prior', ?, ?, ?, 'SEED_PRIOR', 'serial_number', ?, '{}', NULL, 'prior-hash')`,
      ).bind(fixture.tenantId, fixture.branchId, fixture.userId, fixture.serialId),
    ]);
    await processInventoryLocationTransferAtomic(env.DB, fixture.tenantId, fixture.userId, {
      branchId: fixture.branchId,
      sourceLocationId: `loc-default:${fixture.tenantId}:${fixture.branchId}`,
      destinationLocationId: 'loc-destination',
      productId: fixture.productId,
      quantityMicrounits: 1_000_000,
      idempotencyKey: 'serial-location-once',
      actorIsAdminOrOwner: true,
      serialIds: [fixture.serialId],
    });
    const moved = await env.DB.prepare(
      `SELECT location_id, version FROM serial_numbers WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.serialId)
      .first<{ location_id: string; version: number }>();
    expect(moved).toEqual({ location_id: 'loc-destination', version: 2 });
    const audit = await env.DB.prepare(
      `SELECT prev_hash, row_hash FROM audit_events
       WHERE tenant_id = ? AND entity_id = ? AND action = 'SERIAL_TRANSITION' LIMIT 1`,
    )
      .bind(fixture.tenantId, fixture.serialId)
      .first<{ prev_hash: string | null; row_hash: string }>();
    expect(audit?.prev_hash).toBe('prior-hash');
    expect(audit?.row_hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      runD1AtomicPlan(env.DB, async (plan) => {
        await appendSerialTransitionToPlan(plan, env.DB, {
          tenantId: fixture.tenantId,
          serialId: fixture.serialId,
          branchId: fixture.branchId,
          locationId: `loc-default:${fixture.tenantId}:${fixture.branchId}`,
          productId: fixture.productId,
          expectedStatus: 'AVAILABLE',
          nextStatus: 'LOST',
          expectedVersion: 1,
          eventType: 'COUNT_LOSS',
          operationType: 'INVENTORY_COUNT',
          operationId: 'stale-count',
          idempotencyKey: 'stale-count',
          actorUserId: fixture.userId,
        });
      }),
    ).rejects.toThrow();
  });
});
