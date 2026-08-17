import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import { processCreditNoteAtomic } from './process-credit-note-atomic.js';
import {
  createWeightOverrideAuthorization,
  writeScaleHeartbeat,
} from './process-inventory-scale-atomic.js';
import { processOfflineSaleAtomic } from './process-offline-sale-atomic.js';
import { processReturnAtomic } from './process-return-atomic.js';
import { processSyncSalesBatch } from './sync-sales-batch.js';
import { sha256Hex } from './crypto.js';

const NOW_MS = Date.parse('2026-08-08T17:00:00.000Z');
const NOW_ISO = new Date(NOW_MS).toISOString();

/** Reloj de balanza fresco en cada llamada — no fijar al load del módulo (CI >2s → STALE). */
function freshScaleIso(offsetMs = 200): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

async function seedWeightedSale(tenantId: string) {
  const branchId = `branch-${tenantId}`;
  const userId = `user-${tenantId}`;
  const sessionId = `session-${tenantId}`;
  const terminalId = `terminal-${tenantId}`;
  const productId = `product-${tenantId}`;
  const paymentMethodId = `payment-${tenantId}`;
  const batchId = `batch-${tenantId}`;
  const locationId = `loc-default:${tenantId}:${branchId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants
         (id, business_name, vertical_type, shard_id, formalization_mode, enabled_document_types)
       VALUES (?, 'Scale SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL',
               '["NV","NV_RETURN","01","03","07","08"]')`,
    ).bind(tenantId),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'S01', 'Scale', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
       VALUES (?, ?, ?, 'Caja')`,
    ).bind(`register-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'cashier')`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions (
         id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status
       ) VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, `register-${tenantId}`, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series (
         id, tenant_id, branch_id, document_type_code, series, current_number,
         authorization_status
       ) VALUES (?, ?, ?, 'NV', 'NV01', 0, 'INTERNAL')`,
    ).bind(`series-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
       VALUES (?, ?, ?, 'Scale terminal')`,
    ).bind(terminalId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO pos_terminal_sessions (
         id, tenant_id, terminal_id, cash_register_session_id, user_id, branch_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    ).bind(`terminal-session-${tenantId}`, tenantId, terminalId, sessionId, userId, branchId),
    env.DB.prepare(
      `INSERT INTO scale_devices (
         id, tenant_id, terminal_id, protocol, device_fingerprint, status,
         last_heartbeat_at, last_heartbeat_sequence, last_weight_microunits
       ) VALUES (?, ?, ?, 'WEBUSB', ?, 'ACTIVE', ?, NULL, 500000)`,
    ).bind(`scale-${tenantId}`, tenantId, terminalId, `fingerprint-${tenantId}`, freshScaleIso()),
    env.DB.prepare(
      `INSERT INTO tenant_weight_policies (
         id, tenant_id, manual_weight_threshold_microunits
       ) VALUES (?, ?, 1000000)`,
    ).bind(`policy-${tenantId}`, tenantId),
    env.DB.prepare(
      `INSERT INTO products (
         id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents,
         stock, stock_microunits, allow_negative_stock
       ) VALUES (?, ?, ?, 'Queso', 'WEIGH', 'KGM', 199, 100, 2, 2000000, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`),
    env.DB.prepare(
      `INSERT INTO branch_product_stock (
         tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents
       ) VALUES (?, ?, ?, 2, 2000000, 100)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
       VALUES (?, ?, ?, 'DEFAULT', 'Default')`,
    ).bind(locationId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO inventory_location_stock (
         tenant_id, branch_id, location_id, product_id, quantity_microunits
       ) VALUES (?, ?, ?, ?, 2000000)`,
    ).bind(tenantId, branchId, locationId, productId),
    env.DB.prepare(
      `INSERT INTO inventory_batches (
         id, tenant_id, branch_id, product_id, batch_number, stock, stock_microunits,
         expiration_date
       ) VALUES (?, ?, ?, ?, 'LOT-1', 2, 2000000, '2027-01-01')`,
    ).bind(batchId, tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO inventory_location_batch_stock (
         tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits
       ) VALUES (?, ?, ?, ?, ?, 2000000)`,
    ).bind(tenantId, branchId, locationId, productId, batchId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name)
       VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
  ]);
  return {
    branchId,
    userId,
    sessionId,
    terminalId,
    terminalSessionId: `terminal-session-${tenantId}`,
    productId,
    paymentMethodId,
    batchId,
    locationId,
  };
}

async function weightedPayload(
  fixture: Awaited<ReturnType<typeof seedWeightedSale>>,
  offlineSaleId: string,
): Promise<OfflineSalePayload> {
  const tenantId = offlineSaleId.replace(/^off-/, '');
  const observedAt = freshScaleIso();
  // Alinea heartbeat del device al mismo instante que observedAt (ventana ≤2s vs Date.now()).
  await env.DB.prepare(
    `UPDATE scale_devices
     SET last_heartbeat_at = ?, last_weight_microunits = 500000
     WHERE tenant_id = ? AND id = ?`,
  )
    .bind(observedAt, tenantId, `scale-${tenantId}`)
    .run();
  return {
    offlineSaleId,
    branchId: fixture.branchId,
    cashRegisterSessionId: fixture.sessionId,
    documentType: 'NV',
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '00000000',
    clientName: 'Cliente',
    items: [
      {
        productId: fixture.productId,
        saleItemId: `line-a-${offlineSaleId}`,
        serverUnitPriceCents: 999_999,
        baseQuantityMicrounits: 9_999_999,
        resolvedFactorNumerator: 999,
        resolvedFactorDenominator: 1,
        weightMeasurement: {
          measurementId: `measurement-a-${offlineSaleId}`,
          weightMicrounits: 500_000,
          measurementSource: 'DEVICE',
          scaleProtocol: 'WEBUSB',
          scaleDeviceId: `scale-${tenantId}`,
          heartbeatSequence: 10,
          observedAt,
          stable: true,
        },
      },
      {
        productId: fixture.productId,
        saleItemId: `line-b-${offlineSaleId}`,
        weightMeasurement: {
          measurementId: `measurement-b-${offlineSaleId}`,
          weightMicrounits: 500_000,
          measurementSource: 'DEVICE',
          scaleProtocol: 'WEBUSB',
          scaleDeviceId: `scale-${tenantId}`,
          heartbeatSequence: 11,
          observedAt,
          stable: true,
        },
      },
    ],
    payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 236 }],
  };
}

async function expectTenantAuditHashChainIntact(tenantId: string): Promise<void> {
  const audits = await env.DB.prepare(
    `SELECT prev_hash, row_hash FROM audit_events WHERE tenant_id = ? ORDER BY rowid`,
  )
    .bind(tenantId)
    .all<{ prev_hash: string | null; row_hash: string }>();
  expect(audits.results.length).toBeGreaterThan(0);
  audits.results.forEach((audit, index) => {
    expect(audit.row_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.prev_hash).toBe(index === 0 ? null : audits.results[index - 1]?.row_hash);
  });
}

describe('Sprint 40 weighted sale ACID cutover', () => {
  it('keeps same-product lines distinct and reconciles price, branch, location and FEFO stock', async () => {
    const tenantId = 'scale-direct';
    const fixture = await seedWeightedSale(tenantId);
    const payload = await weightedPayload(fixture, `off-${tenantId}`);

    const result = await processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, payload, {
      nowMs: NOW_MS,
      inventoryScaleEnabled: true,
      terminalId: fixture.terminalId,
      s18: { inventoryBatches: true, inventoryBom: false, pricingLists: false },
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.authoritativeTotalAmount).toBe(236);
    const saleItems = await env.DB.prepare(
      `SELECT id, base_quantity_microunits, unit_price_cents, subtotal_cents, batch_id
       FROM sale_items WHERE tenant_id = ? AND sale_id = ? ORDER BY id`,
    )
      .bind(tenantId, result.saleId)
      .all<{
        id: string;
        base_quantity_microunits: number;
        unit_price_cents: number;
        subtotal_cents: number;
        batch_id: string | null;
      }>();
    expect(saleItems.results).toEqual([
      {
        id: `line-a-off-${tenantId}`,
        base_quantity_microunits: 500_000,
        unit_price_cents: 199,
        subtotal_cents: 100,
        batch_id: fixture.batchId,
      },
      {
        id: `line-b-off-${tenantId}`,
        base_quantity_microunits: 500_000,
        unit_price_cents: 199,
        subtotal_cents: 100,
        batch_id: fixture.batchId,
      },
    ]);
    const measurements = await env.DB.prepare(
      `SELECT sale_item_id, weight_microunits, unit_price_per_base_cents, subtotal_cents
       FROM weight_measurements WHERE tenant_id = ? ORDER BY sale_item_id`,
    )
      .bind(tenantId)
      .all();
    expect(measurements.results).toHaveLength(2);
    expect(measurements.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sale_item_id: `line-a-off-${tenantId}`,
          weight_microunits: 500_000,
          unit_price_per_base_cents: 199,
          subtotal_cents: 100,
        }),
        expect.objectContaining({
          sale_item_id: `line-b-off-${tenantId}`,
          weight_microunits: 500_000,
          unit_price_per_base_cents: 199,
          subtotal_cents: 100,
        }),
      ]),
    );
    const branch = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.branchId, fixture.productId)
      .first<{ stock_microunits: number }>();
    const location = await env.DB.prepare(
      `SELECT quantity_microunits FROM inventory_location_stock
       WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.branchId, fixture.locationId, fixture.productId)
      .first<{ quantity_microunits: number }>();
    const batch = await env.DB.prepare(
      `SELECT stock_microunits FROM inventory_batches WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, fixture.batchId)
      .first<{ stock_microunits: number }>();
    const locationBatch = await env.DB.prepare(
      `SELECT quantity_microunits FROM inventory_location_batch_stock
       WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ? AND batch_id = ?`,
    )
      .bind(tenantId, fixture.branchId, fixture.locationId, fixture.productId, fixture.batchId)
      .first<{ quantity_microunits: number }>();
    expect(branch?.stock_microunits).toBe(1_000_000);
    expect(location?.quantity_microunits).toBe(1_000_000);
    expect(batch?.stock_microunits).toBe(1_000_000);
    expect(locationBatch?.quantity_microunits).toBe(1_000_000);
  });

  it('fails stale device facts before any sale or stock write', async () => {
    const tenantId = 'scale-stale';
    const fixture = await seedWeightedSale(tenantId);
    const payload = await weightedPayload(fixture, `off-${tenantId}`);
    const stale = {
      ...payload,
      items: payload.items.map((item) => ({
        ...item,
        weightMeasurement: {
          ...item.weightMeasurement!,
          observedAt: new Date(NOW_MS - 2_000).toISOString(),
        },
      })),
    };

    await expect(
      processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, stale, {
        nowMs: NOW_MS,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
      }),
    ).rejects.toThrow('SCALE_HEARTBEAT_STALE');
    const saleCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
      .bind(tenantId)
      .first<{ n: number }>();
    const stock = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock_microunits: number }>();
    expect(saleCount?.n).toBe(0);
    expect(stock?.stock_microunits).toBe(2_000_000);
  });

  it('hashes an opaque override token in direct and sync paths and rejects its digest as token', async () => {
    const runPath = async (tenantId: string, viaSync: boolean) => {
      const fixture = await seedWeightedSale(tenantId);
      const nowMs = Date.now();
      const offlineSaleId = `off-${tenantId}`;
      const saleItemId = `line-${tenantId}`;
      const measurementId = `measurement-${tenantId}`;
      await env.DB.prepare(
        `UPDATE tenant_weight_policies
         SET manual_weight_threshold_microunits = 0 WHERE tenant_id = ?`,
      )
        .bind(tenantId)
        .run();
      const issued = await createWeightOverrideAuthorization(env.DB, {
        tenantId,
        actorUserId: fixture.userId,
        approvedByUserId: `supervisor-${tenantId}`,
        terminalId: fixture.terminalId,
        saleId: null,
        offlineSaleId,
        saleItemId,
        measurementId,
        action: 'WEIGHT_OVERRIDE',
        ttlSeconds: 90,
      });
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(issued.authorizationToken),
      );
      const digestHex = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const base = await weightedPayload(fixture, offlineSaleId);
      const manual = (authorizationToken: string): OfflineSalePayload => ({
        ...base,
        items: [
          {
            productId: fixture.productId,
            saleItemId,
            weightMeasurement: {
              measurementId,
              weightMicrounits: 250_000,
              measurementSource: 'MANUAL',
              observedAt: new Date(nowMs).toISOString(),
              authorizationToken,
            },
          },
        ],
        payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 59 }],
      });
      if (viaSync) {
        const rejected = await processSyncSalesBatch(
          env.DB,
          tenantId,
          fixture.userId,
          [manual(digestHex)],
          nowMs,
          undefined,
          false,
          fixture.terminalId,
          { inventoryScaleEnabled: true, terminalId: fixture.terminalId },
        );
        expect(rejected.results[0]).toMatchObject({
          status: 'FAILED',
          code: 'WEIGHT_OVERRIDE_INVALID',
        });
        const accepted = await processSyncSalesBatch(
          env.DB,
          tenantId,
          fixture.userId,
          [manual(issued.authorizationToken)],
          nowMs,
          undefined,
          false,
          fixture.terminalId,
          { inventoryScaleEnabled: true, terminalId: fixture.terminalId },
        );
        expect(accepted.results[0]).toMatchObject({ status: 'SUCCESS' });
      } else {
        await expect(
          processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, manual(digestHex), {
            nowMs,
            inventoryScaleEnabled: true,
            terminalId: fixture.terminalId,
          }),
        ).rejects.toThrow('WEIGHT_OVERRIDE_INVALID');
        await expect(
          processOfflineSaleAtomic(
            env.DB,
            tenantId,
            fixture.userId,
            manual(issued.authorizationToken),
            {
              nowMs,
              inventoryScaleEnabled: true,
              terminalId: fixture.terminalId,
            },
          ),
        ).resolves.toMatchObject({ status: 'SUCCESS' });
      }
    };
    await runPath('scale-token-direct-created', false);
    await runPath('scale-token-sync-created', true);
  });

  it('rejects same-tenant terminal spoof, branch spoof, inactive terminal and missing binding', async () => {
    const cases = [
      'other-terminal',
      'other-branch',
      'inactive-terminal',
      'missing-binding',
    ] as const;
    for (const scenario of cases) {
      const tenantId = `scale-binding-${scenario}`;
      const fixture = await seedWeightedSale(tenantId);
      const payload = await weightedPayload(fixture, `off-${tenantId}`);
      let terminalId = fixture.terminalId;
      if (scenario === 'other-terminal') {
        terminalId = `terminal-other-${tenantId}`;
        await env.DB.prepare(
          `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
           VALUES (?, ?, ?, 'Other terminal')`,
        )
          .bind(terminalId, tenantId, fixture.branchId)
          .run();
      } else if (scenario === 'other-branch') {
        payload.branchId = `branch-other-${tenantId}`;
      } else if (scenario === 'inactive-terminal') {
        await env.DB.prepare(`UPDATE pos_terminals SET active = 0 WHERE tenant_id = ? AND id = ?`)
          .bind(tenantId, terminalId)
          .run();
      } else {
        await env.DB.prepare(`DELETE FROM pos_terminal_sessions WHERE tenant_id = ?`)
          .bind(tenantId)
          .run();
      }
      const rejection = expect(
        processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, payload, {
          nowMs: NOW_MS,
          inventoryScaleEnabled: true,
          terminalId,
        }),
      ).rejects;
      if (scenario === 'other-branch') {
        await rejection.toThrow('Invalid or closed cash register session');
      } else {
        await rejection.toThrow('TERMINAL_SESSION_FORBIDDEN');
      }
    }
  });

  it('writes monotonic heartbeat only for the bound device, terminal session and protocol', async () => {
    const tenantId = 'scale-heartbeat-writer';
    const fixture = await seedWeightedSale(tenantId);
    const base = {
      tenantId,
      userId: fixture.userId,
      terminalId: fixture.terminalId,
      terminalSessionId: fixture.terminalSessionId,
      cashRegisterSessionId: fixture.sessionId,
      branchId: fixture.branchId,
      deviceId: `scale-${tenantId}`,
      protocol: 'WEBUSB' as const,
      heartbeatSequence: 1,
      observedAt: new Date().toISOString(),
    };
    await expect(writeScaleHeartbeat(env.DB, base)).resolves.toMatchObject({
      heartbeatSequence: 1,
    });
    await expect(writeScaleHeartbeat(env.DB, base)).rejects.toThrow('SCALE_HEARTBEAT_REORDERED');
    await expect(
      writeScaleHeartbeat(env.DB, {
        ...base,
        terminalId: `terminal-other-${tenantId}`,
        heartbeatSequence: 2,
      }),
    ).rejects.toThrow('TERMINAL_SESSION_FORBIDDEN');
    await expect(
      writeScaleHeartbeat(env.DB, {
        ...base,
        deviceId: `scale-other-${tenantId}`,
        heartbeatSequence: 2,
      }),
    ).rejects.toThrow('SCALE_DEVICE_SCOPE_MISMATCH');
    await expect(
      writeScaleHeartbeat(env.DB, { ...base, heartbeatSequence: 2, protocol: 'WEBHID' }),
    ).rejects.toThrow('SCALE_HEARTBEAT_PROTOCOL_MISMATCH');
    await expect(
      writeScaleHeartbeat(env.DB, {
        ...base,
        heartbeatSequence: 2,
        observedAt: new Date(Date.now() - 2_000).toISOString(),
      }),
    ).rejects.toThrow('SCALE_HEARTBEAT_STALE');
  });

  it('concurrent duplicate measurement is idempotent with one sale and one stock debit', async () => {
    const tenantId = 'scale-measurement-race';
    const fixture = await seedWeightedSale(tenantId);
    const base = await weightedPayload(fixture, `off-${tenantId}`);
    const payload: OfflineSalePayload = {
      ...base,
      items: [base.items[0]!],
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 118 }],
    };

    const outcomes = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, payload, {
          nowMs: NOW_MS,
          inventoryScaleEnabled: true,
          terminalId: fixture.terminalId,
        }),
      ),
    );
    const statuses = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value.status] : [],
    );
    expect(statuses.filter((status) => status === 'SUCCESS')).toHaveLength(1);
    expect(statuses.filter((status) => status === 'ALREADY_SYNCED')).toHaveLength(1);

    const state = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM sales WHERE tenant_id = ?) AS sale_count,
         (SELECT COUNT(*) FROM sale_items WHERE tenant_id = ?) AS line_count,
         (SELECT COUNT(*) FROM weight_measurements WHERE tenant_id = ?) AS measurement_count,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM sale_payments WHERE tenant_id = ?) AS paid_cents,
         (SELECT stock_microunits FROM branch_product_stock
          WHERE tenant_id = ? AND product_id = ?) AS stock_microunits`,
    )
      .bind(tenantId, tenantId, tenantId, tenantId, tenantId, fixture.productId)
      .first<{
        sale_count: number;
        line_count: number;
        measurement_count: number;
        paid_cents: number;
        stock_microunits: number;
      }>();
    expect(state).toEqual({
      sale_count: 1,
      line_count: 1,
      measurement_count: 1,
      paid_cents: 118,
      stock_microunits: 1_500_000,
    });
    await expectTenantAuditHashChainIntact(tenantId);
  });

  it('one-shot authorization race has one winner and no partial money or stock drift', async () => {
    const tenantId = 'scale-token-race';
    const fixture = await seedWeightedSale(tenantId);
    const nowMs = Date.now();
    const token = 'opaque-racing-weight-token';
    const tokenHash = await sha256Hex(token);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenant_weight_policies
         SET manual_weight_threshold_microunits = 0 WHERE tenant_id = ?`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO authorization_tokens (
           id, tenant_id, token_hash, approved_by_user_id, actor_user_id, expires_at,
           action, terminal_id, offline_sale_id, sale_item_id, measurement_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'WEIGHT_OVERRIDE', ?, ?, ?, ?)`,
      ).bind(
        `token-${tenantId}`,
        tenantId,
        tokenHash,
        fixture.userId,
        fixture.userId,
        new Date(nowMs + 60_000).toISOString(),
        fixture.terminalId,
        `off-${tenantId}`,
        `line-${tenantId}`,
        `measurement-${tenantId}`,
      ),
    ]);
    const payload: OfflineSalePayload = {
      ...(await weightedPayload(fixture, `off-${tenantId}`)),
      items: [
        {
          productId: fixture.productId,
          saleItemId: `line-${tenantId}`,
          weightMeasurement: {
            measurementId: `measurement-${tenantId}`,
            weightMicrounits: 250_000,
            measurementSource: 'MANUAL',
            observedAt: new Date(nowMs).toISOString(),
            authorizationToken: token,
          },
        },
      ],
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 59 }],
    };

    const outcomes = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, payload, {
          nowMs,
          inventoryScaleEnabled: true,
          terminalId: fixture.terminalId,
        }),
      ),
    );
    const statuses = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value.status] : [],
    );
    expect(statuses.filter((status) => status === 'SUCCESS')).toHaveLength(1);
    expect(outcomes).toHaveLength(2);

    const state = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM sales WHERE tenant_id = ?) AS sale_count,
         (SELECT COUNT(*) FROM weight_measurements WHERE tenant_id = ?) AS measurement_count,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM sale_payments WHERE tenant_id = ?) AS paid_cents,
         (SELECT stock_microunits FROM branch_product_stock
          WHERE tenant_id = ? AND product_id = ?) AS stock_microunits,
         (SELECT COUNT(*) FROM authorization_tokens
          WHERE tenant_id = ? AND used_at IS NOT NULL) AS consumed_tokens`,
    )
      .bind(tenantId, tenantId, tenantId, tenantId, fixture.productId, tenantId)
      .first<{
        sale_count: number;
        measurement_count: number;
        paid_cents: number;
        stock_microunits: number;
        consumed_tokens: number;
      }>();
    expect(state).toEqual({
      sale_count: 1,
      measurement_count: 1,
      paid_cents: 59,
      stock_microunits: 1_750_000,
      consumed_tokens: 1,
    });
    await expectTenantAuditHashChainIntact(tenantId);
  });

  it('uses the same authoritative reconciliation in direct and batch-sync paths', async () => {
    const directTenant = 'scale-parity-direct';
    const syncTenant = 'scale-parity-sync';
    const directFixture = await seedWeightedSale(directTenant);
    const syncFixture = await seedWeightedSale(syncTenant);
    const direct = await processOfflineSaleAtomic(
      env.DB,
      directTenant,
      directFixture.userId,
      await weightedPayload(directFixture, `off-${directTenant}`),
      {
        nowMs: NOW_MS,
        inventoryScaleEnabled: true,
        terminalId: directFixture.terminalId,
        s18: { inventoryBatches: true, inventoryBom: false, pricingLists: false },
      },
    );
    const synced = await processSyncSalesBatch(
      env.DB,
      syncTenant,
      syncFixture.userId,
      [await weightedPayload(syncFixture, `off-${syncTenant}`)],
      NOW_MS,
      undefined,
      false,
      syncFixture.terminalId,
      {
        inventoryScaleEnabled: true,
        terminalId: syncFixture.terminalId,
        s18: { inventoryBatches: true, inventoryBom: false, pricingLists: false },
      },
    );

    expect(direct.authoritativeTotalAmount).toBe(236);
    expect(synced.results).toEqual([
      expect.objectContaining({ status: 'SUCCESS', offlineSaleId: `off-${syncTenant}` }),
    ]);
    const syncSale = await env.DB.prepare(
      `SELECT total_amount_cents FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind(syncTenant, `off-${syncTenant}`)
      .first<{ total_amount_cents: number }>();
    const syncLines = await env.DB.prepare(
      `SELECT base_quantity_microunits, unit_price_cents, subtotal_cents
       FROM sale_items WHERE tenant_id = ? ORDER BY id`,
    )
      .bind(syncTenant)
      .all();
    expect(syncSale?.total_amount_cents).toBe(236);
    expect(syncLines.results).toEqual([
      expect.objectContaining({
        base_quantity_microunits: 500_000,
        unit_price_cents: 199,
        subtotal_cents: 100,
      }),
      expect.objectContaining({
        base_quantity_microunits: 500_000,
        unit_price_cents: 199,
        subtotal_cents: 100,
      }),
    ]);
  });

  it('consumes a scoped manual override once and rejects replay without partial stock', async () => {
    const tenantId = 'scale-token';
    const fixture = await seedWeightedSale(tenantId);
    const nowMs = Date.now();
    const token = 'opaque-weight-token';
    const tokenHash = await sha256Hex(token);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenant_weight_policies
         SET manual_weight_threshold_microunits = 0 WHERE tenant_id = ?`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO authorization_tokens (
           id, tenant_id, token_hash, approved_by_user_id, actor_user_id, expires_at,
           action, terminal_id, offline_sale_id, sale_item_id, measurement_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'WEIGHT_OVERRIDE', ?, ?, ?, ?)`,
      ).bind(
        `token-${tenantId}`,
        tenantId,
        tokenHash,
        fixture.userId,
        fixture.userId,
        new Date(nowMs + 60_000).toISOString(),
        fixture.terminalId,
        `off-${tenantId}`,
        `line-${tenantId}`,
        `measurement-${tenantId}`,
      ),
    ]);
    const payload: OfflineSalePayload = {
      ...(await weightedPayload(fixture, `off-${tenantId}`)),
      items: [
        {
          productId: fixture.productId,
          saleItemId: `line-${tenantId}`,
          weightMeasurement: {
            measurementId: `measurement-${tenantId}`,
            weightMicrounits: 250_000,
            measurementSource: 'MANUAL',
            observedAt: new Date(nowMs).toISOString(),
            authorizationToken: token,
          },
        },
      ],
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 59 }],
    };

    await processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, payload, {
      nowMs,
      inventoryScaleEnabled: true,
      terminalId: fixture.terminalId,
    });
    const used = await env.DB.prepare(
      `SELECT used_at FROM authorization_tokens WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, `token-${tenantId}`)
      .first<{ used_at: string | null }>();
    expect(used?.used_at).not.toBeNull();
    const beforeReplay = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock_microunits: number }>();

    await expect(
      processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          ...payload,
          offlineSaleId: `off-${tenantId}-replay`,
          items: [
            {
              ...payload.items[0]!,
              saleItemId: `line-${tenantId}-replay`,
              weightMeasurement: {
                ...payload.items[0]!.weightMeasurement!,
                measurementId: `measurement-${tenantId}-replay`,
              },
            },
          ],
        },
        { nowMs, inventoryScaleEnabled: true, terminalId: fixture.terminalId },
      ),
    ).rejects.toThrow('WEIGHT_OVERRIDE_INVALID');
    const afterReplay = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock_microunits: number }>();
    expect(afterReplay?.stock_microunits).toBe(beforeReplay?.stock_microunits);
  });

  it('rolls back sale, measurement, stock and audit when the batch tail fails', async () => {
    const tenantId = 'scale-rollback';
    const fixture = await seedWeightedSale(tenantId);
    await env.DB.prepare(
      `CREATE TRIGGER fail_scale_rollback_audit
       BEFORE INSERT ON audit_events
       WHEN NEW.tenant_id = '${tenantId}' AND NEW.action = 'WEIGHT_MEASUREMENT'
       BEGIN
         SELECT RAISE(ABORT, 'TEST_SCALE_AUDIT_FAILURE');
       END`,
    ).run();
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        await weightedPayload(fixture, `off-${tenantId}`),
        {
          nowMs: NOW_MS,
          inventoryScaleEnabled: true,
          terminalId: fixture.terminalId,
          s18: { inventoryBatches: true, inventoryBom: false, pricingLists: false },
        },
      ),
    ).rejects.toThrow('TEST_SCALE_AUDIT_FAILURE');
    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM sales WHERE tenant_id = ?) AS sales_count,
         (SELECT COUNT(*) FROM sale_items WHERE tenant_id = ?) AS item_count,
         (SELECT COUNT(*) FROM weight_measurements WHERE tenant_id = ?) AS measurement_count,
         (SELECT COUNT(*) FROM audit_events WHERE tenant_id = ?) AS audit_count`,
    )
      .bind(tenantId, tenantId, tenantId, tenantId)
      .first<{
        sales_count: number;
        item_count: number;
        measurement_count: number;
        audit_count: number;
      }>();
    const stock = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock_microunits: number }>();
    expect(counts).toEqual({
      sales_count: 0,
      item_count: 0,
      measurement_count: 0,
      audit_count: 0,
    });
    expect(stock?.stock_microunits).toBe(2_000_000);
  });

  it('restores the exact weighted microunits and appends an immutable reversal event', async () => {
    const tenantId = 'scale-return';
    const fixture = await seedWeightedSale(tenantId);
    await env.DB.prepare(
      `INSERT INTO branch_document_series (
         id, tenant_id, branch_id, document_type_code, series, current_number,
         authorization_status
       ) VALUES (?, ?, ?, 'NV_RETURN', 'NVR1', 0, 'INTERNAL')`,
    )
      .bind(`series-return-${tenantId}`, tenantId, fixture.branchId)
      .run();
    const originPayload: OfflineSalePayload = {
      ...(await weightedPayload(fixture, `off-${tenantId}`)),
      items: [(await weightedPayload(fixture, `off-${tenantId}`)).items[0]!],
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 118 }],
    };
    const origin = await processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, originPayload, {
      nowMs: NOW_MS,
      inventoryScaleEnabled: true,
      terminalId: fixture.terminalId,
      s18: { inventoryBatches: true, inventoryBom: false, pricingLists: false },
    });
    await processReturnAtomic(env.DB, tenantId, fixture.userId, {
      originSaleId: origin.saleId,
      lines: [
        {
          originalSaleItemId: `line-a-off-${tenantId}`,
          qtyMicrounits: 500_000,
        },
      ],
      reason: 'Producto devuelto',
      series: 'NVR1',
      nowMs: NOW_MS,
    });

    const branch = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock_microunits: number }>();
    const locationBatch = await env.DB.prepare(
      `SELECT quantity_microunits FROM inventory_location_batch_stock
       WHERE tenant_id = ? AND batch_id = ?`,
    )
      .bind(tenantId, fixture.batchId)
      .first<{ quantity_microunits: number }>();
    const returned = await env.DB.prepare(
      `SELECT qty_microunits FROM sale_return_items
       WHERE tenant_id = ? AND original_sale_item_id = ?`,
    )
      .bind(tenantId, `line-a-off-${tenantId}`)
      .first<{ qty_microunits: number }>();
    const reversal = await env.DB.prepare(
      `SELECT action, entity_id, payload_json FROM audit_events
       WHERE tenant_id = ? AND action = 'WEIGHT_MEASUREMENT_REVERSED'`,
    )
      .bind(tenantId)
      .first<{ action: string; entity_id: string; payload_json: string }>();
    expect(branch?.stock_microunits).toBe(2_000_000);
    expect(locationBatch?.quantity_microunits).toBe(2_000_000);
    expect(returned?.qty_microunits).toBe(500_000);
    expect(reversal?.entity_id).toBe(`measurement-a-off-${tenantId}`);
    expect(JSON.parse(reversal?.payload_json ?? '{}')).toMatchObject({
      originalSaleItemId: `line-a-off-${tenantId}`,
      restoredWeightMicrounits: 500_000,
    });
  });

  it('credit note restores the referenced weighted line in exact microunits', async () => {
    const tenantId = 'scale-credit-note';
    const fixture = await seedWeightedSale(tenantId);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG'
         WHERE id = ?`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branch_document_series (
           id, tenant_id, branch_id, document_type_code, series, current_number,
           authorization_status
         ) VALUES (?, ?, ?, '01', 'F001', 0, 'INTERNAL'),
                  (?, ?, ?, '07', 'FC01', 0, 'INTERNAL')`,
      ).bind(
        `series-invoice-${tenantId}`,
        tenantId,
        fixture.branchId,
        `series-cn-${tenantId}`,
        tenantId,
        fixture.branchId,
      ),
    ]);
    const base = await weightedPayload(fixture, `off-${tenantId}`);
    const origin = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...base,
        documentType: '01',
        series: 'F001',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
        clientName: 'Comprador SAC',
        items: [base.items[0]!],
        payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 118 }],
      },
      {
        nowMs: NOW_MS,
        inventoryScaleEnabled: true,
        terminalId: fixture.terminalId,
        s18: { inventoryBatches: true, inventoryBom: false, pricingLists: false },
      },
    );
    await env.DB.prepare(`UPDATE sales SET sunat_status = 'ACCEPTED' WHERE id = ?`)
      .bind(origin.saleId)
      .run();
    await processCreditNoteAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      origin.saleId,
      {
        motiveCode: '01',
        amountCents: 118,
        fullCancellation: true,
        items: [
          {
            productId: fixture.productId,
            quantity: 0.5,
            isUncatalogued: false,
            originalSaleItemId: `line-a-off-${tenantId}`,
            quantityMicrounits: 500_000,
          },
        ],
      },
      'FC01',
    );

    const branch = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock_microunits: number }>();
    const locationBatch = await env.DB.prepare(
      `SELECT quantity_microunits FROM inventory_location_batch_stock
       WHERE tenant_id = ? AND batch_id = ?`,
    )
      .bind(tenantId, fixture.batchId)
      .first<{ quantity_microunits: number }>();
    const reversal = await env.DB.prepare(
      `SELECT entity_id FROM audit_events
       WHERE tenant_id = ? AND action = 'WEIGHT_MEASUREMENT_REVERSED'
       ORDER BY rowid DESC LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ entity_id: string }>();
    expect(branch?.stock_microunits).toBe(2_000_000);
    expect(locationBatch?.quantity_microunits).toBe(2_000_000);
    expect(reversal?.entity_id).toBe(`measurement-a-off-${tenantId}`);
  });
});
