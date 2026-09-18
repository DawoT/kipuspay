import { describe, expect, it } from 'vitest';
import { buildOperationalSeedSql, buildTenantCapabilitySnapshots, OPERATIONAL_TENANTS, PHARMACY_FEFO_SCENARIO, TEST_PIN_HASH } from './operational-seed.mjs';
import { validateOperationalSeedSql } from './validate-operational-seed.mjs';
import { verifyPinHash } from '../../packages/domain-ops/src/pin-crypto.ts';
import { buildSeedEvidence } from './operational-seed-artifacts.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('operational seed contract', () => {
  it('generates six isolated vertical tenants with NV and capabilities', () => {
    const sql = buildOperationalSeedSql();
    expect(OPERATIONAL_TENANTS).toHaveLength(6);
    for (const tenant of OPERATIONAL_TENANTS) {
      expect(sql).toContain(`'seed_${tenant.key}'`);
      expect(sql).toContain(`'seed_${tenant.key}_nv'`);
      expect(sql).toContain(`'seed_${tenant.key}_product'`);
      expect(sql).toContain(`'seed_${tenant.key}_sale'`);
      expect(sql).toContain(`'seed_${tenant.key}', 'pos.checkout'`);
      expect(sql).toContain(`'seed_${tenant.key}', 'auth.cashier_login'`);
      expect(sql).toContain(`'seed_${tenant.key}_cashier'`);
      expect(sql).toContain(TEST_PIN_HASH);
    }
  });

  it('seeds distinct capability sets and active tenant control-plane snapshots for all six tenants', () => {
    const snapshots = buildTenantCapabilitySnapshots();
    expect(snapshots).toHaveLength(6);
    expect(new Set(OPERATIONAL_TENANTS.map((tenant) => tenant.vertical)).size).toBe(6);
    for (const snapshot of snapshots) {
      expect(snapshot.key).toBe(`tenant:seed_${snapshot.tenant}`);
      expect(JSON.parse(snapshot.value)).toMatchObject({
        id: `seed_${snapshot.tenant}`,
        status: 'active',
        subscriptionStatus: 'active',
        plan_id: expect.any(String),
      });
    }
    const byTenant = new Map(snapshots.map(({ tenant, capabilities }) => [tenant, capabilities]));
    expect(byTenant.get('restaurante')).toContain('orders.kds');
    expect(byTenant.get('farmacia')).toContain('inventory.batches');
    expect(byTenant.get('cadena')).toContain('stock.transfers');
    expect(byTenant.get('grifos')).toContain('fuel.dispatch');
    expect(byTenant.get('servicios')).toContain('sales.recurring');
    expect(byTenant.get('grifos')).toContain('cash.blind_z');
    expect(byTenant.get('grifos')).toContain('ops.shift_handoff');
    expect(byTenant.get('retail')).not.toContain('fuel.dispatch');
  });

  it('uses a fixed Argon2id test PIN hash, never plaintext', async () => {
    expect(TEST_PIN_HASH).toMatch(/^\$argon2id\$v=19\$/);
    expect(await verifyPinHash('4826', TEST_PIN_HASH)).toMatchObject({ ok: true, needsRehash: false });
    expect(await verifyPinHash('0000', TEST_PIN_HASH)).toMatchObject({ ok: false });
    expect(buildOperationalSeedSql()).not.toContain('4826');
  });

  it('generates auditable evidence without storing test secrets', () => {
    const evidence = buildSeedEvidence('/tmp/kipuspay-seed-state', buildOperationalSeedSql(), '2026-09-16T00:00:00.000Z');
    expect(evidence).toMatchObject({
      environment: 'local',
      application: 'pending',
      bindings: { d1: 'DB', kv: 'TENANT_KV' },
      credentials: { format: 'argon2id', plaintextIncluded: false, pinHashIncluded: false },
    });
    expect(evidence.tenants).toHaveLength(6);
    expect(JSON.stringify(evidence)).not.toContain('4826');
    expect(JSON.stringify(evidence)).not.toContain(TEST_PIN_HASH);
  });

  it('requires an explicit isolated state-dir and keeps the seed local-only', () => {
    expect(buildOperationalSeedSql().toLowerCase()).not.toContain('staging');
    const script = resolve('scripts/staff/apply-operational-seed.sh');
    const missingState = spawnSync('bash', [script], { encoding: 'utf8' });
    expect(missingState.status).toBe(2);
    expect(missingState.stderr).toContain('--state-dir');
    const help = execFileSync('bash', [script, '--help'], { encoding: 'utf8' });
    expect(help).toContain('--state-dir <ruta>');
    expect(help).not.toContain('--staging');
  });

  it('includes inventory, purchasing, promotion and fuel scenarios', () => {
    const sql = buildOperationalSeedSql();
    expect(sql).toContain('INSERT OR IGNORE INTO inventory_batches');
    expect(sql).toContain('INSERT OR IGNORE INTO inventory_movements');
    expect(sql).toContain("'VENTA', -1");
    expect(sql).toContain('INSERT OR IGNORE INTO purchase_orders');
    expect(sql).toContain('INSERT OR IGNORE INTO promotions');
    expect(sql).toContain('INSERT OR IGNORE INTO fuel_catalog');
    expect(sql).toContain('INSERT OR IGNORE INTO fuel_dispatches');
    expect(sql).toContain("'seed_cadena_branch_2', 'seed_cadena', '0002', 'Local destino'");
  });

  it('seeds the canonical cash payment method used by the POS for every tenant', () => {
    const sql = buildOperationalSeedSql();
    for (const tenant of OPERATIONAL_TENANTS) {
      expect(sql).toContain(`VALUES ('pm-cash', 'seed_${tenant.key}', 'cash', 'Efectivo', 1)`);
    }
  });

  it('keeps every primary inventory batch in sync with its microunit stock', () => {
    const sql = buildOperationalSeedSql();
    for (const tenant of OPERATIONAL_TENANTS) {
      expect(sql).toContain(
        `VALUES ('seed_${tenant.key}_batch', 'seed_${tenant.key}', 'seed_${tenant.key}_branch', 'seed_${tenant.key}_product', 'LOT-${tenant.key}-001', '2027-12-31', 23, 23000000, 1)`,
      );
      expect(sql).toContain(
        `VALUES ('loc-default:seed_${tenant.key}:seed_${tenant.key}_branch', 'seed_${tenant.key}', 'seed_${tenant.key}_branch', 'DEFAULT', 'Almacén principal', 1)`,
      );
    }
  });

  it('seeds Pharmacy FEFO lots across valid and expired products with location traceability', () => {
    const sql = buildOperationalSeedSql();
    expect(sql).toContain("'seed_farmacia_fefo_product'");
    for (const batch of PHARMACY_FEFO_SCENARIO.valid.batches) {
      expect(sql).toContain(`'seed_farmacia_${batch.idSuffix}', 'seed_farmacia'`);
      expect(sql).toContain(`'${batch.expirationDate}'`);
    }
    expect(sql).toContain("'seed_farmacia_expired_product'");
    expect(sql).toContain(`'${PHARMACY_FEFO_SCENARIO.expired.batch.expirationDate}'`);
    expect(sql).toContain('inventory_location_batch_stock');
  });

  it('keeps FEFO fixture stock balanced and dates valid at its reference date', () => {
    const asOf = Date.parse(`${PHARMACY_FEFO_SCENARIO.asOfDate}T00:00:00.000Z`);
    const validQty = PHARMACY_FEFO_SCENARIO.valid.batches.reduce((sum, batch) => sum + batch.stock, 0);
    expect(validQty).toBe(PHARMACY_FEFO_SCENARIO.valid.stock);
    expect(PHARMACY_FEFO_SCENARIO.valid.batches.every((batch) => Date.parse(`${batch.expirationDate}T00:00:00.000Z`) > asOf)).toBe(true);
    expect(PHARMACY_FEFO_SCENARIO.expired.batch.stock).toBe(PHARMACY_FEFO_SCENARIO.expired.stock);
    expect(Date.parse(`${PHARMACY_FEFO_SCENARIO.expired.batch.expirationDate}T00:00:00.000Z`)).toBeLessThan(asOf);
    expect(PHARMACY_FEFO_SCENARIO.valid.stockMicrounits).toBe(PHARMACY_FEFO_SCENARIO.valid.stock * 1_000_000);
    expect(PHARMACY_FEFO_SCENARIO.expired.stockMicrounits).toBe(PHARMACY_FEFO_SCENARIO.expired.stock * 1_000_000);

    const sql = buildOperationalSeedSql();
    const pharmacyRows = sql.split('\n').filter((line) => line.includes("'seed_farmacia_"));
    const rowFor = (marker) => pharmacyRows.find((line) => line.includes(marker));
    const fefoProduct = rowFor("VALUES ('seed_farmacia_fefo_product'");
    const fefoBranch = rowFor(`'seed_farmacia_fefo_product', ${PHARMACY_FEFO_SCENARIO.valid.stock},`);
    const fefoLocation = rowFor(`'seed_farmacia_fefo_product', ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits});`);
    expect(fefoProduct).toContain(`, ${PHARMACY_FEFO_SCENARIO.valid.stock}, ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits},`);
    expect(fefoBranch).toContain(`, ${PHARMACY_FEFO_SCENARIO.valid.stock}, ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits},`);
    expect(fefoLocation).toContain(`, ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits});`);
    for (const batch of PHARMACY_FEFO_SCENARIO.valid.batches) {
      const batchId = `seed_farmacia_${batch.idSuffix}`;
      const batchRow = rowFor(`VALUES ('${batchId}'`);
      const batchLocation = rowFor(`'${batchId}', ${batch.stock * 1_000_000});`);
      expect(batchRow).toContain(`, ${batch.stock}, ${batch.stock * 1_000_000}, 1);`);
      expect(batchLocation).toContain(`'${batchId}', ${batch.stock * 1_000_000});`);
    }

    const expired = PHARMACY_FEFO_SCENARIO.expired;
    const expiredProduct = rowFor("VALUES ('seed_farmacia_expired_product'");
    const expiredBatch = rowFor("VALUES ('seed_farmacia_expired_batch'");
    const expiredLocation = rowFor(`'seed_farmacia_expired_product', ${expired.stockMicrounits});`);
    expect(expiredProduct).toContain(`, ${expired.stock}, ${expired.stockMicrounits},`);
    expect(expiredBatch).toContain(`, '${expired.batch.expirationDate}', ${expired.batch.stock}, ${expired.batch.stock * 1_000_000}, 1);`);
    expect(expiredLocation).toContain(`, ${expired.stockMicrounits});`);
  });

  it('is safe to rerun and never uses forbidden SQL constructs', () => {
    const sql = buildOperationalSeedSql();
    expect(sql).not.toMatch(/UPSERT INTO|db\.transaction\(/i);
    expect(sql).toMatch(/INSERT OR IGNORE/);
    expect(sql).not.toMatch(/UPDATE\s+(products|branch_product_stock|inventory_batches|inventory_location_stock|inventory_location_batch_stock|fuel_catalog)\s+SET\s+stock/i);
  });

  it('seeds NV series after its existing sale so the next checkout gets a fresh number', () => {
    const sql = buildOperationalSeedSql();
    expect(sql).toContain("'NV', 'NV01', 1, 'INTERNAL', 1");
  });

  it('seeds a Restaurant FIRED order that the KDS replay endpoint can load', () => {
    const sql = buildOperationalSeedSql();
    expect(sql).toContain("'seed_restaurante_kds_order', 'seed_restaurante', 'seed_restaurante_branch', '4', 'FIRED', 'seed_restaurante_owner'");
    expect(sql).toContain("'seed_restaurante_kds_item', 'seed_restaurante', 'seed_restaurante_kds_order', 'seed_restaurante_product', 'Producto restaurante', 1, 1000000, 1180, 'FIRED'");
  });

  it('DR drill fixture uses a rolling Lima-closed date instead of expiring', async () => {
    const source = await (await import('node:fs/promises')).readFile(
      resolve('scripts/staff/seed-dr-drill-staging.sql'),
      'utf8',
    );
    expect(source).toContain("strftime('%Y-%m-%dT15:30:00.000', 'now', '-5 hours', '-1 day')");
    expect(source).not.toContain('2026-08-21T15:30:00.000');
    expect(source).toContain("WHERE id = 'dr-drill-sale-001'");
    expect(source).toContain("'dr-drill-sale-' || strftime('%Y%m%d', 'now', '-5 hours', '-1 day')");
    expect(source).toContain('evita colisionar con el restore idempotente');
  });

  it('seeds a service-only recurring plan with a base UOM and no inventory rows', () => {
    const sql = buildOperationalSeedSql();
    expect(sql).toContain("'seed_servicios_owner', 'seed_servicios', 'seed_servicios_branch', 'seed_servicios.owner@example.invalid', 'owner', '[\"sales.recurring.manage\"]'");
    expect(sql).toContain("'seed_servicios_service', 'seed_servicios', 'SKU-servicios-SVC', 'Mantenimiento mensual', 'service'");
    expect(sql).toContain("'seed_servicios_service_uom', 'seed_servicios', 'seed_servicios_service', 'ZZ', 1, 1, 1");
    expect(sql).toContain("'seed_servicios_recurring', 'seed_servicios', 'mantenimiento-mensual', 1");
    expect(sql).toContain("'2099-01-01T09:00:00-05:00'");
    expect(sql).toContain("'seed_servicios_recurring_item', 'seed_servicios', 'seed_servicios_recurring', 1, 'seed_servicios_service', 'seed_servicios_service_uom'");
    expect(sql).toContain("'seed_servicios_service', 'seed_servicios', 'SKU-servicios-SVC', 'Mantenimiento mensual', 'service', 'ZZ', 5000, 0, 0, 0,");
    for (const table of ['branch_product_stock', 'inventory_location_stock', 'inventory_batches', 'inventory_location_batch_stock']) {
      expect(sql).not.toMatch(new RegExp(`INSERT OR IGNORE INTO ${table}[^\\n]*'seed_servicios_service'`));
    }
  });

  it('validator rejects an incomplete or forbidden seed', () => {
    expect(validateOperationalSeedSql('UPSERT INTO tenants')).toEqual({
      ok: false,
      errors: expect.arrayContaining(['forbidden transaction syntax']),
    });
    expect(validateOperationalSeedSql(buildOperationalSeedSql()).ok).toBe(true);
  });
});
