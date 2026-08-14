import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  loadHistoryForProduct,
  listForecastCandidates,
  todayLima,
  writeForecastForCandidate,
} from './forecast-repository.js';

async function seedForecastFixture(
  suffix: string,
  days = 45,
): Promise<{
  tenantId: string;
  branchId: string;
  productId: string;
  userId: string;
}> {
  const tenantId = `t-forecast-${suffix}`;
  const branchId = `b-forecast-${suffix}`;
  const productId = `p-forecast-${suffix}`;
  const userId = `u-forecast-${suffix}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Forecast SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).bind(userId, tenantId, branchId, `${suffix}@example.com`),
    env.DB.prepare(
      `INSERT INTO products (
         id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents,
         stock, stock_microunits, allow_negative_stock
       ) VALUES (?, ?, 'SK', 'Producto', 'physical', 'NIU', 1000, 400, 50, 50000000, 0)`,
    ).bind(productId, tenantId),
    env.DB.prepare(
      `UPDATE products SET is_sellable = 1, is_active = 1 WHERE tenant_id = ? AND id = ?`,
    ).bind(tenantId, productId),
    env.DB.prepare(
      `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 50, 50000000, 400)`,
    ).bind(tenantId, branchId, productId),
  ]);
  // Historial de ventas diario (45 días con patrón).
  const now = Date.parse('2026-08-08T12:00:00.000Z');
  const stmts = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const qty = 10 + ((i * 7) % 20);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO daily_product_rollups (tenant_id, branch_id, report_date, product_id, qty, gross_cents, cogs_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(tenantId, branchId, date, productId, qty, qty * 1180, qty * 400),
    );
  }
  await env.DB.batch(stmts);
  return { tenantId, branchId, productId, userId };
}

describe('S46-H2: forecast-repository D1 real (workerd)', () => {
  it('loadHistoryForProduct lee la ventana y descarta lo viejo', async () => {
    const fx = await seedForecastFixture('hist', 120);
    const now = Date.parse('2026-08-08T12:00:00.000Z');
    const rows = await loadHistoryForProduct(
      env.DB,
      fx.tenantId,
      fx.branchId,
      fx.productId,
      new Date(now - 90 * 86400000).toISOString().slice(0, 10),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(91); // ventana 90 días (rango inclusivo)
    expect(rows.every((r) => r.qty > 0 && r.grossCents > 0)).toBe(true);
  });

  it('writeForecastForCandidate es idempotente (DELETE+INSERT, UNIQUE, 0 duplicados)', async () => {
    const fx = await seedForecastFixture('write');
    const now = Date.parse('2026-08-08T12:00:00.000Z');
    const date = todayLima(now);
    const input = {
      tenantId: fx.tenantId,
      branchId: fx.branchId,
      productId: fx.productId,
      userId: fx.userId,
      forecastDate: date,
      predictedQty: 12.5,
      predictedGrossCents: 14750,
      confidenceLowQty: 8,
      confidenceHighQty: 17,
      modelVersion: 'holt-winters-v1',
      costCents: 400,
      pmpUnitCostCents: 400,
      stock: 50,
      stockMicrounits: 50000000,
      isActive: 1,
      allowNegativeStock: 0,
      productType: 'physical',
      unitCode: 'NIU',
      igvAffectationCodeDefault: '10',
    };
    // Doble escritura (cron + refresh manual) → mismo resultado, 0 duplicados.
    await writeForecastForCandidate(env.DB, input, now);
    await writeForecastForCandidate(env.DB, input, now);

    const rows = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM forecast_outputs
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND forecast_date = ?`,
    )
      .bind(fx.tenantId, fx.branchId, fx.productId, date)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it('listForecastCandidates devuelve solo productos vendibles con historial', async () => {
    const fx = await seedForecastFixture('list');
    const now = Date.parse('2026-08-08T12:00:00.000Z');
    const candidates = await listForecastCandidates(
      env.DB,
      fx.tenantId,
      fx.branchId,
      new Date(now - 90 * 86400000).toISOString().slice(0, 10),
      now,
    );
    const found = candidates.find((c) => c.productId === fx.productId);
    expect(found).toBeDefined();
  });
});
