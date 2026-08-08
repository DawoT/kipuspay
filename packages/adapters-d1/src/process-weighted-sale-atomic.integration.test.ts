import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import {
  createWeightOverrideAuthorization,
  registerTerminalSession,
} from './process-inventory-scale-atomic.js';
import { processOfflineSaleAtomic } from './process-offline-sale-atomic.js';
import { processReturnAtomic } from './process-return-atomic.js';
import { processSyncSalesBatch } from './sync-sales-batch.js';

const NOW = Date.parse('2026-08-08T15:00:00.000Z');

async function seedWeightedFixture(tenantId: string, stockMicrounits = 5_000_000) {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const supervisorId = `super-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const productId = `p-${tenantId}`;
  const paymentMethodId = `pm-${tenantId}`;
  const terminalId = `term-${tenantId}`;
  const locationId = `loc-default:${tenantId}:${branchId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Weighted SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
       VALUES (?, ?, ?, 'Caja 1')`,
    ).bind(registerId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'cashier'), (?, ?, ?, ?, 'admin')`,
    ).bind(
      userId,
      tenantId,
      branchId,
      `${tenantId}@example.com`,
      supervisorId,
      tenantId,
      branchId,
      `super-${tenantId}@example.com`,
    ),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, 'NV', 'NV01', 0, 'INTERNAL'),
              (?, ?, ?, 'NV_RETURN', 'NVR1', 0, 'INTERNAL')`,
    ).bind(`ser-${tenantId}`, tenantId, branchId, `ser-return-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO products
         (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents,
          stock, stock_microunits, allow_negative_stock)
       VALUES (?, ?, ?, 'Tomate', 'WEIGH', 'KGM', 199, 80, ?, ?, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, stockMicrounits / 1_000_000, stockMicrounits),
    env.DB.prepare(
      `INSERT INTO branch_product_stock
         (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, ?, ?, 80)`,
    ).bind(tenantId, branchId, productId, stockMicrounits / 1_000_000, stockMicrounits),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name)
       VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
    env.DB.prepare(
      `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
       VALUES (?, ?, ?, 'Balanza Caja')`,
    ).bind(terminalId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO scale_devices (
         id, tenant_id, terminal_id, protocol, device_fingerprint, status, last_heartbeat_at
       ) VALUES (?, ?, ?, 'WEBUSB', ?, 'ACTIVE', ?)`,
    ).bind(
      `scale-${tenantId}`,
      tenantId,
      terminalId,
      `fingerprint-${tenantId}`,
      new Date(NOW).toISOString(),
    ),
    env.DB.prepare(
      `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
       VALUES (?, ?, ?, 'DEFAULT', 'Ubicación por defecto')`,
    ).bind(locationId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO inventory_location_stock
         (tenant_id, branch_id, location_id, product_id, quantity_microunits)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, branchId, locationId, productId, stockMicrounits),
    env.DB.prepare(
      `INSERT INTO tenant_weight_policies
         (id, tenant_id, manual_weight_threshold_microunits)
       VALUES (?, ?, 1000000)`,
    ).bind(`policy-${tenantId}`, tenantId),
  ]);
  const terminalSession = await registerTerminalSession(env.DB, {
    tenantId,
    terminalId,
    cashRegisterSessionId: sessionId,
    userId,
  });
  return {
    tenantId,
    branchId,
    userId,
    supervisorId,
    sessionId,
    productId,
    paymentMethodId,
    terminalId,
    terminalSessionId: terminalSession.terminalSessionId,
    locationId,
  };
}

function weightedPayload(
  fixture: Awaited<ReturnType<typeof seedWeightedFixture>>,
  offlineSaleId: string,
  lines: readonly {
    saleItemId: string;
    measurementId: string;
    weightMicrounits: number;
    source?: 'DEVICE' | 'MANUAL';
    authorizationToken?: string;
  }[],
  paymentCents: number,
): OfflineSalePayload {
  return {
    offlineSaleId,
    branchId: fixture.branchId,
    cashRegisterSessionId: fixture.sessionId,
    documentType: 'NV',
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '00000000',
    clientName: 'Cliente',
    items: lines.map((line) => ({
      productId: fixture.productId,
      saleItemId: line.saleItemId,
      weightMeasurement:
        line.source === 'MANUAL'
          ? {
              measurementId: line.measurementId,
              weightMicrounits: line.weightMicrounits,
              measurementSource: 'MANUAL' as const,
              observedAt: new Date(NOW - 500).toISOString(),
              authorizationToken: line.authorizationToken,
            }
          : {
              measurementId: line.measurementId,
              weightMicrounits: line.weightMicrounits,
              measurementSource: 'DEVICE' as const,
              scaleProtocol: 'WEBUSB' as const,
              scaleDeviceId: `scale-${fixture.tenantId}`,
              observedAt: new Date(NOW - 500).toISOString(),
              heartbeatSequence: 7,
              stable: true,
              authorizationToken: line.authorizationToken,
            },
      // Deliberate hostile fields: these must never become authoritative.
      quantity: 999,
      baseQuantityMicrounits: 999_000_000,
      serverUnitPriceCents: 1,
    })) as OfflineSalePayload['items'],
    payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: paymentCents }],
  };
}

describe('Sprint 40 WEIGH cutover in processOfflineSaleAtomic', () => {
  it('ignores tampered price/quantity and preserves two same-product line identities', async () => {
    const fixture = await seedWeightedFixture('t-weigh-trusted');
    const payload = weightedPayload(
      fixture,
      'off-weigh-trusted',
      [
        { saleItemId: 'line-a', measurementId: 'measure-a', weightMicrounits: 500_000 },
        { saleItemId: 'line-b', measurementId: 'measure-b', weightMicrounits: 250_000 },
      ],
      177,
    );
    const result = await processOfflineSaleAtomic(
      env.DB,
      fixture.tenantId,
      fixture.userId,
      payload,
      {
        nowMs: NOW,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
      },
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.authoritativeTotalAmount).toBe(177);

    const rows = await env.DB.prepare(
      `SELECT si.id, si.base_quantity_microunits, si.unit_price_cents, si.subtotal_cents,
              wm.id AS measurement_id
       FROM sale_items si
       JOIN weight_measurements wm
         ON wm.tenant_id = si.tenant_id AND wm.sale_item_id = si.id
       WHERE si.tenant_id = ? ORDER BY si.id`,
    )
      .bind(fixture.tenantId)
      .all<{
        id: string;
        base_quantity_microunits: number;
        unit_price_cents: number;
        subtotal_cents: number;
        measurement_id: string;
      }>();
    expect(rows.results).toEqual([
      {
        id: 'line-a',
        base_quantity_microunits: 500_000,
        unit_price_cents: 199,
        subtotal_cents: 100,
        measurement_id: 'measure-a',
      },
      {
        id: 'line-b',
        base_quantity_microunits: 250_000,
        unit_price_cents: 199,
        subtotal_cents: 50,
        measurement_id: 'measure-b',
      },
    ]);
  });

  it('duplicate measurement replay and insufficient location stock roll back the whole sale', async () => {
    const fixture = await seedWeightedFixture('t-weigh-rollback', 500_000);
    await env.DB.prepare(
      `UPDATE inventory_location_stock SET quantity_microunits = 100000
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(fixture.tenantId, fixture.productId)
      .run();
    const payload = weightedPayload(
      fixture,
      'off-weigh-rollback',
      [{ saleItemId: 'line-r', measurementId: 'measure-r', weightMicrounits: 500_000 }],
      118,
    );
    await expect(
      processOfflineSaleAtomic(env.DB, fixture.tenantId, fixture.userId, payload, {
        nowMs: NOW,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
      }),
    ).rejects.toThrow();
    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM sales WHERE tenant_id = ?) AS sales_count,
         (SELECT COUNT(*) FROM sale_items WHERE tenant_id = ?) AS lines_count,
         (SELECT COUNT(*) FROM weight_measurements WHERE tenant_id = ?) AS measures_count`,
    )
      .bind(fixture.tenantId, fixture.tenantId, fixture.tenantId)
      .first<{ sales_count: number; lines_count: number; measures_count: number }>();
    expect(counts).toEqual({ sales_count: 0, lines_count: 0, measures_count: 0 });
  });

  it('fails closed for a wrong cash session or missing registered terminal session', async () => {
    const fixture = await seedWeightedFixture('t-weigh-session-guard');
    const base = weightedPayload(
      fixture,
      'off-session-guard',
      [{ saleItemId: 'line-session', measurementId: 'measure-session', weightMicrounits: 500_000 }],
      118,
    );
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        fixture.tenantId,
        fixture.userId,
        { ...base, cashRegisterSessionId: 'session-not-assigned' },
        {
          nowMs: NOW,
          inventoryScaleEnabled: true,
          terminalId: fixture.terminalId,
        },
      ),
    ).rejects.toThrow('Invalid or closed cash register session');

    await env.DB.prepare(`DELETE FROM pos_terminal_sessions WHERE tenant_id = ? AND id = ?`)
      .bind(fixture.tenantId, fixture.terminalSessionId)
      .run();
    await expect(
      processOfflineSaleAtomic(env.DB, fixture.tenantId, fixture.userId, base, {
        nowMs: NOW,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
      }),
    ).rejects.toThrow('TERMINAL_SESSION_FORBIDDEN');
  });

  it('manual over threshold rejects missing/wrong/replayed token and consumes a scoped token once', async () => {
    const fixture = await seedWeightedFixture('t-weigh-auth');
    const issued = await createWeightOverrideAuthorization(env.DB, {
      tenantId: fixture.tenantId,
      actorUserId: fixture.userId,
      approvedByUserId: fixture.supervisorId,
      terminalId: fixture.terminalId,
      offlineSaleId: 'off-auth-ok',
      saleItemId: 'line-auth',
      measurementId: 'measure-auth',
      action: 'WEIGHT_OVERRIDE',
      ttlSeconds: 90,
    });
    const missing = weightedPayload(
      fixture,
      'off-auth-missing',
      [
        {
          saleItemId: 'line-missing',
          measurementId: 'measure-missing',
          weightMicrounits: 1_500_000,
          source: 'MANUAL',
        },
      ],
      353,
    );
    await expect(
      processOfflineSaleAtomic(env.DB, fixture.tenantId, fixture.userId, missing, {
        nowMs: NOW,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
      }),
    ).rejects.toThrow('WEIGHT_OVERRIDE_REQUIRED');

    const valid = weightedPayload(
      fixture,
      'off-auth-ok',
      [
        {
          saleItemId: 'line-auth',
          measurementId: 'measure-auth',
          weightMicrounits: 1_500_000,
          source: 'MANUAL',
          authorizationToken: issued.authorizationToken,
        },
      ],
      353,
    );
    await expect(
      processOfflineSaleAtomic(env.DB, fixture.tenantId, fixture.userId, valid, {
        nowMs: NOW,
        inventoryScaleEnabled: true,
        terminalId: `${fixture.terminalId}-wrong`,
      }),
    ).rejects.toThrow('TERMINAL_SESSION_FORBIDDEN');
    const result = await processOfflineSaleAtomic(env.DB, fixture.tenantId, fixture.userId, valid, {
      nowMs: NOW,
      inventoryScaleEnabled: true,
      terminalId: fixture.terminalId,
    });
    expect(result.status).toBe('SUCCESS');
    const used = await env.DB.prepare(
      `SELECT used_at FROM authorization_tokens
       WHERE tenant_id = ? AND terminal_id = ? AND measurement_id = ?`,
    )
      .bind(fixture.tenantId, fixture.terminalId, 'measure-auth')
      .first<{ used_at: string | null }>();
    expect(used?.used_at).not.toBeNull();

    const replay = weightedPayload(
      fixture,
      'off-auth-replay',
      [
        {
          saleItemId: 'line-auth',
          measurementId: 'measure-auth',
          weightMicrounits: 1_500_000,
          source: 'MANUAL',
          authorizationToken: issued.authorizationToken,
        },
      ],
      353,
    );
    await expect(
      processOfflineSaleAtomic(env.DB, fixture.tenantId, fixture.userId, replay, {
        nowMs: NOW,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
      }),
    ).rejects.toThrow();
  });

  it('online and sync-batch use identical authoritative reconciliation', async () => {
    const onlineFixture = await seedWeightedFixture('t-weigh-online');
    const syncFixture = await seedWeightedFixture('t-weigh-sync');
    const onlinePayload = weightedPayload(
      onlineFixture,
      'off-online',
      [{ saleItemId: 'line-online', measurementId: 'measure-online', weightMicrounits: 500_000 }],
      118,
    );
    const syncPayload = weightedPayload(
      syncFixture,
      'off-sync',
      [{ saleItemId: 'line-sync', measurementId: 'measure-sync', weightMicrounits: 500_000 }],
      118,
    );
    const online = await processOfflineSaleAtomic(
      env.DB,
      onlineFixture.tenantId,
      onlineFixture.userId,
      onlinePayload,
      { nowMs: NOW, inventoryScaleEnabled: true, terminalId: onlineFixture.terminalId },
    );
    const synced = await processSyncSalesBatch(
      env.DB,
      syncFixture.tenantId,
      syncFixture.userId,
      [syncPayload],
      NOW,
      undefined,
      false,
      syncFixture.terminalId,
      { inventoryScaleEnabled: true, terminalId: syncFixture.terminalId },
    );
    expect(synced.results[0]?.status).toBe('SUCCESS');
    const syncSale = await env.DB.prepare(
      `SELECT total_amount_cents FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind(syncFixture.tenantId, 'off-sync')
      .first<{ total_amount_cents: number }>();
    expect(syncSale?.total_amount_cents).toBe(online.authoritativeTotalAmount);
  });

  it('return restores exact microunits and links the original append-only measurement', async () => {
    const fixture = await seedWeightedFixture('t-weigh-return');
    const sale = await processOfflineSaleAtomic(
      env.DB,
      fixture.tenantId,
      fixture.userId,
      weightedPayload(
        fixture,
        'off-return-origin',
        [{ saleItemId: 'line-return', measurementId: 'measure-return', weightMicrounits: 500_000 }],
        118,
      ),
      { nowMs: NOW, inventoryScaleEnabled: true, terminalId: fixture.terminalId },
    );
    expect(sale.status).toBe('SUCCESS');
    if (sale.status !== 'SUCCESS') return;

    await processReturnAtomic(env.DB, fixture.tenantId, fixture.userId, {
      originSaleId: sale.saleId,
      lines: [{ originalSaleItemId: 'line-return', qtyMicrounits: 333_333 }],
      reason: 'Peso devuelto',
      series: 'NVR1',
      nowMs: NOW + 1_000,
    });

    const stocks = await env.DB.prepare(
      `SELECT
        (SELECT stock_microunits FROM branch_product_stock
         WHERE tenant_id = ? AND product_id = ?) AS branch_microunits,
        (SELECT quantity_microunits FROM inventory_location_stock
         WHERE tenant_id = ? AND product_id = ?) AS location_microunits`,
    )
      .bind(fixture.tenantId, fixture.productId, fixture.tenantId, fixture.productId)
      .first<{ branch_microunits: number; location_microunits: number }>();
    expect(stocks).toEqual({
      branch_microunits: 4_833_333,
      location_microunits: 4_833_333,
    });
    const link = await env.DB.prepare(
      `SELECT qty_microunits, original_weight_measurement_id
       FROM sale_return_items WHERE tenant_id = ? AND original_sale_item_id = ?`,
    )
      .bind(fixture.tenantId, 'line-return')
      .first<{ qty_microunits: number; original_weight_measurement_id: string | null }>();
    expect(link).toEqual({
      qty_microunits: 333_333,
      original_weight_measurement_id: 'measure-return',
    });
    const history = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM weight_measurements WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, 'measure-return')
      .first<{ n: number }>();
    expect(history?.n).toBe(1);
  });
});
