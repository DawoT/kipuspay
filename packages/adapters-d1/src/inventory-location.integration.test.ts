import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  appendLocationStockDeltaToPlan,
  createInventoryLocationAtomic,
  processInventoryLocationTransferAtomic,
  runD1AtomicPlan,
} from './index.js';

describe('inventory locations ACID', () => {
  it('helper dual-write crea DEFAULT y aplica delta en el mismo plan', async () => {
    const tenantId = 't-mirror';
    const branchId = 'b-mirror';
    const productId = 'p-mirror';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Mirror SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'M01', 'Mirror', 'Lima')`,
      ).bind(branchId, tenantId),
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents,
           igv_affectation_code_default, stock, stock_microunits
         ) VALUES (?, ?, 'MIRROR-1', 'Producto', 'physical', 'NIU', 100, '10', 0, 0)`,
      ).bind(productId, tenantId),
    ]);

    await runD1AtomicPlan(env.DB, (plan) => {
      appendLocationStockDeltaToPlan(plan, env.DB, {
        tenantId,
        branchId,
        productId,
        deltaMicrounits: 750_000,
      });
    });

    const stock = await env.DB.prepare(
      `SELECT l.code, s.quantity_microunits
       FROM inventory_location_stock s
       JOIN inventory_locations l
         ON l.tenant_id = s.tenant_id AND l.branch_id = s.branch_id
        AND l.id = s.location_id
       WHERE s.tenant_id = ? AND s.branch_id = ? AND s.product_id = ?`,
    )
      .bind(tenantId, branchId, productId)
      .first<{ code: string; quantity_microunits: number }>();
    expect(stock).toEqual({ code: 'DEFAULT', quantity_microunits: 750_000 });
  });

  it('transferencia idempotente conserva agregado y audita', async () => {
    const tenantId = 't-loc';
    const branchId = 'b-loc';
    const userId = 'u-loc';
    const productId = 'p-loc';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Locations SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'L01', 'Local', 'Lima')`,
      ).bind(branchId, tenantId),
      env.DB.prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, 'loc@example.com', 'admin')`,
      ).bind(userId, tenantId, branchId),
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, barcode, name, product_type, unit_code,
           price_cents, cost_cents, igv_affectation_code_default, stock, stock_microunits
         ) VALUES (?, ?, 'LOC-1', 'LOC-1', 'Producto', 'physical', 'NIU',
                   100, 50, '10', 5, 5000000)`,
      ).bind(productId, tenantId),
      env.DB.prepare(
        `INSERT INTO branch_product_stock (
           tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents
         ) VALUES (?, ?, ?, 5, 5000000, 50)`,
      ).bind(tenantId, branchId, productId),
    ]);

    const source = await createInventoryLocationAtomic(env.DB, tenantId, userId, {
      branchId,
      code: 'A-01',
      name: 'Rack A',
      actorIsAdminOrOwner: true,
    });
    const destination = await createInventoryLocationAtomic(env.DB, tenantId, userId, {
      branchId,
      code: 'B-01',
      name: 'Rack B',
      actorIsAdminOrOwner: true,
    });
    await env.DB.prepare(
      `INSERT INTO inventory_location_stock (
         tenant_id, branch_id, location_id, product_id, quantity_microunits
       ) VALUES (?, ?, ?, ?, 5000000)`,
    )
      .bind(tenantId, branchId, source.locationId, productId)
      .run();

    const first = await processInventoryLocationTransferAtomic(env.DB, tenantId, userId, {
      branchId,
      sourceLocationId: source.locationId,
      destinationLocationId: destination.locationId,
      productId,
      quantityMicrounits: 1_250_000,
      idempotencyKey: 'idem-loc-1',
      actorIsAdminOrOwner: true,
    });
    const retry = await processInventoryLocationTransferAtomic(env.DB, tenantId, userId, {
      branchId,
      sourceLocationId: source.locationId,
      destinationLocationId: destination.locationId,
      productId,
      quantityMicrounits: 1_250_000,
      idempotencyKey: 'idem-loc-1',
      actorIsAdminOrOwner: true,
    });

    expect(retry).toEqual(first);
    const rows = await env.DB.prepare(
      `SELECT location_id, quantity_microunits
       FROM inventory_location_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
       ORDER BY location_id`,
    )
      .bind(tenantId, branchId, productId)
      .all<{ location_id: string; quantity_microunits: number }>();
    expect((rows.results ?? []).reduce((sum, row) => sum + row.quantity_microunits, 0)).toBe(
      5_000_000,
    );
    const branch = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    )
      .bind(tenantId, branchId, productId)
      .first<{ stock_microunits: number }>();
    expect(branch?.stock_microunits).toBe(5_000_000);
    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events
       WHERE tenant_id = ? AND entity_id = ?`,
    )
      .bind(tenantId, first.transferId)
      .first<{ action: string }>();
    expect(audit?.action).toBe('LOCATION_TRANSFER');
  });
});
