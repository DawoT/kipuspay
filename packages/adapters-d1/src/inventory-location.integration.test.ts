import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  appendLocationStockDeltaToPlan,
  createInventoryLocationAtomic,
  deactivateInventoryLocationAtomic,
  processInventoryLocationTransferAtomic,
  runD1AtomicPlan,
  updateInventoryLocationAtomic,
} from './index.js';

describe('inventory locations ACID', () => {
  it('dos transferencias concurrentes no sobre-venden el rack origen', async () => {
    const tenantId = 't-loc-race';
    const branchId = 'b-loc-race';
    const userId = 'u-loc-race';
    const productId = 'p-loc-race';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Race SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'RACE', 'Race', 'Lima')`,
      ).bind(branchId, tenantId),
      env.DB.prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, 'race@example.com', 'admin')`,
      ).bind(userId, tenantId, branchId),
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents,
           igv_affectation_code_default, stock, stock_microunits
         ) VALUES (?, ?, 'RACE-1', 'Race', 'physical', 'NIU', 100, '10', 1, 1000000)`,
      ).bind(productId, tenantId),
      env.DB.prepare(
        `INSERT INTO branch_product_stock (
           tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents
         ) VALUES (?, ?, ?, 1, 1000000, 50)`,
      ).bind(tenantId, branchId, productId),
      ...['source', 'dest-a', 'dest-b'].map((suffix) =>
        env.DB.prepare(
          `INSERT INTO inventory_locations (id, tenant_id, branch_id, code)
           VALUES (?, ?, ?, ?)`,
        ).bind(`loc-${suffix}`, tenantId, branchId, suffix.toUpperCase()),
      ),
      env.DB.prepare(
        `INSERT INTO inventory_location_stock (
           tenant_id, branch_id, location_id, product_id, quantity_microunits
         ) VALUES (?, ?, 'loc-source', ?, 1000000)`,
      ).bind(tenantId, branchId, productId),
    ]);
    const run = (destinationLocationId: string, idempotencyKey: string) =>
      processInventoryLocationTransferAtomic(env.DB, tenantId, userId, {
        branchId,
        sourceLocationId: 'loc-source',
        destinationLocationId,
        productId,
        quantityMicrounits: 750_000,
        idempotencyKey,
        actorIsAdminOrOwner: true,
      });
    const outcomes = await Promise.allSettled([
      run('loc-dest-a', 'race-a'),
      run('loc-dest-b', 'race-b'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const total = await env.DB.prepare(
      `SELECT SUM(quantity_microunits) AS quantity_microunits
       FROM inventory_location_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    )
      .bind(tenantId, branchId, productId)
      .first<{ quantity_microunits: number }>();
    expect(total?.quantity_microunits).toBe(1_000_000);
  });

  it('edita y desactiva solo una ubicación vacía', async () => {
    const tenantId = 't-loc-crud';
    const branchId = 'b-loc-crud';
    const userId = 'u-loc-crud';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'CRUD SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'CRUD', 'CRUD', 'Lima')`,
      ).bind(branchId, tenantId),
      env.DB.prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, 'crud@example.com', 'admin')`,
      ).bind(userId, tenantId, branchId),
    ]);
    const created = await createInventoryLocationAtomic(env.DB, tenantId, userId, {
      branchId,
      code: 'A-01',
      actorIsAdminOrOwner: true,
    });
    await updateInventoryLocationAtomic(env.DB, tenantId, userId, {
      branchId,
      locationId: created.locationId,
      code: 'A-02',
      name: 'Rack editado',
      actorIsAdminOrOwner: true,
    });
    await expect(
      deactivateInventoryLocationAtomic(env.DB, tenantId, {
        branchId,
        locationId: created.locationId,
        actorIsAdminOrOwner: true,
      }),
    ).resolves.toEqual({ locationId: created.locationId, active: false });
  });

  it('FK compuesta impide cruzar lote entre sucursales hermanas', async () => {
    const tenantId = 't-lot-isolation';
    const productId = 'p-lot-isolation';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Lots SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      ...['a', 'b'].map((suffix) =>
        env.DB.prepare(
          `INSERT INTO branches (id, tenant_id, code, name, address)
           VALUES (?, ?, ?, ?, 'Lima')`,
        ).bind(`b-lot-${suffix}`, tenantId, suffix.toUpperCase(), `Branch ${suffix}`),
      ),
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents,
           igv_affectation_code_default, stock, stock_microunits
         ) VALUES (?, ?, 'LOT-1', 'Lote', 'physical', 'NIU', 100, '10', 0, 0)`,
      ).bind(productId, tenantId),
      env.DB.prepare(
        `INSERT INTO inventory_locations (id, tenant_id, branch_id, code)
         VALUES ('loc-lot-b', ?, 'b-lot-b', 'DEFAULT')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO inventory_location_stock (
           tenant_id, branch_id, location_id, product_id, quantity_microunits
         ) VALUES (?, 'b-lot-b', 'loc-lot-b', ?, 0)`,
      ).bind(tenantId, productId),
      env.DB.prepare(
        `INSERT INTO inventory_batches (
           id, tenant_id, branch_id, product_id, batch_number, stock, stock_microunits
         ) VALUES ('batch-lot-a', ?, 'b-lot-a', ?, 'LOT-A', 1, 1000000)`,
      ).bind(tenantId, productId),
    ]);
    await expect(
      env.DB.prepare(
        `INSERT INTO inventory_location_batch_stock (
           tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits
         ) VALUES (?, 'b-lot-b', 'loc-lot-b', ?, 'batch-lot-a', 0)`,
      )
        .bind(tenantId, productId)
        .run(),
    ).rejects.toThrow();
  });

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

    expect(first.alreadyApplied).toBe(false);
    expect(retry.alreadyApplied).toBe(true);
    expect(retry.transferId).toBe(first.transferId);
    expect(retry.sourceAfterMicrounits).toBe(first.sourceAfterMicrounits);
    expect(retry.destinationAfterMicrounits).toBe(first.destinationAfterMicrounits);

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

  it('impide desactivar ubicación DEFAULT o ubicación con stock', async () => {
    const tenantId = 't-deact-guard';
    const branchId = 'b-deact-guard';
    const userId = 'u-deact-guard';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Deact SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'DEACT', 'Deact', 'Lima')`,
      ).bind(branchId, tenantId),
      env.DB.prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, 'deact@example.com', 'admin')`,
      ).bind(userId, tenantId, branchId),
    ]);
    const defaultLocId = `loc-default:${tenantId}:${branchId}`;

    await expect(
      deactivateInventoryLocationAtomic(env.DB, tenantId, {
        branchId,
        locationId: defaultLocId,
        actorIsAdminOrOwner: true,
      }),
    ).rejects.toThrow('LOCATION_DEFAULT_IMMUTABLE');

    const loc = await createInventoryLocationAtomic(env.DB, tenantId, userId, {
      branchId,
      code: 'RACK-STOCK',
      actorIsAdminOrOwner: true,
    });
    const productId = 'p-stock-guard';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents,
           igv_affectation_code_default, stock, stock_microunits
         ) VALUES (?, ?, 'GUARD-1', 'Prod', 'physical', 'NIU', 100, '10', 0, 0)`,
      ).bind(productId, tenantId),
      env.DB.prepare(
        `INSERT INTO branch_product_stock (
           tenant_id, branch_id, product_id, stock_microunits
         ) VALUES (?, ?, ?, 0)`,
      ).bind(tenantId, branchId, productId),
    ]);

    await runD1AtomicPlan(env.DB, (plan) => {
      appendLocationStockDeltaToPlan(plan, env.DB, {
        tenantId,
        branchId,
        locationId: loc.locationId,
        productId,
        deltaMicrounits: 1_000_000,
      });
    });

    await expect(
      deactivateInventoryLocationAtomic(env.DB, tenantId, {
        branchId,
        locationId: loc.locationId,
        actorIsAdminOrOwner: true,
      }),
    ).rejects.toThrow('LOCATION_NONEMPTY');
  });
});
