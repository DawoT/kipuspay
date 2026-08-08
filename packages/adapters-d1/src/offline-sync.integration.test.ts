import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { processOfflineSaleAtomic } from './process-offline-sale-atomic.js';
import { processSyncSalesBatch } from './sync-sales-batch.js';
import { isClosedReportDate, rematerializeDailyRollupIfClosedDay } from './rollup-rematerialize.js';
import { runDailyRollupsCron } from './daily-rollups-cron.js';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';

async function seed(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
  productId: string;
  paymentMethodId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const productId = `p-${tenantId}`;
  const paymentMethodId = `pm-${tenantId}`;
  const seriesId = `ser-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'Sync SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, ?)`,
    ).bind(registerId, tenantId, branchId, 'Caja 1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, ?)`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, 'NV', 'NV01', 0, 'INTERNAL')`,
    ).bind(seriesId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO products
         (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
       VALUES (?, ?, ?, ?, 'physical', 'NIU', 1000, 400, 100, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto'),
    env.DB.prepare(
      `INSERT INTO branch_product_stock
         (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 100, 100000000, 400)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
  ]);

  return { branchId, sessionId, userId, productId, paymentMethodId };
}

function nv(
  fixture: Awaited<ReturnType<typeof seed>>,
  offlineSaleId: string,
  extras: Partial<OfflineSalePayload> = {},
): OfflineSalePayload {
  return {
    offlineSaleId,
    branchId: fixture.branchId,
    cashRegisterSessionId: fixture.sessionId,
    documentType: 'NV',
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '12345678',
    clientName: 'Cliente',
    items: [{ productId: fixture.productId, quantity: 1 }],
    payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1180 }],
    ...extras,
  };
}

describe('offline sync — CRM LWW / batch / edge D', () => {
  it('LWW: perfil nuevo gana; viejo no pisa', async () => {
    const tenantId = 't-lww-1';
    const fixture = await seed(tenantId);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      nv(fixture, 'off-lww-1', {
        clientName: 'Ana Vieja',
        clientEmail: 'old@example.com',
        clientProfileUpdatedAt: '2026-08-04T10:00:00.000Z',
      }),
      now,
    );

    await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      nv(fixture, 'off-lww-2', {
        clientName: 'Ana Nueva',
        clientEmail: 'new@example.com',
        clientProfileUpdatedAt: '2026-08-04T14:00:00.000Z',
      }),
      now,
    );

    const cust = await env.DB.prepare(
      `SELECT name, email FROM customers WHERE tenant_id = ? AND document_number = '12345678'`,
    )
      .bind(tenantId)
      .first<{ name: string; email: string }>();
    expect(cust?.name).toBe('Ana Nueva');
    expect(cust?.email).toBe('new@example.com');

    await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      nv(fixture, 'off-lww-3', {
        clientName: 'Ana Stale',
        clientEmail: 'stale@example.com',
        clientProfileUpdatedAt: '2026-08-04T11:00:00.000Z',
      }),
      now,
    );
    const after = await env.DB.prepare(
      `SELECT name, email FROM customers WHERE tenant_id = ? AND document_number = '12345678'`,
    )
      .bind(tenantId)
      .first<{ name: string; email: string }>();
    expect(after?.name).toBe('Ana Nueva');
  });

  it('SEC-07: pii_erased fail-closed', async () => {
    const tenantId = 't-lww-pii';
    const fixture = await seed(tenantId);
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    await env.DB.prepare(
      `INSERT INTO customers (
         id, tenant_id, document_type_code, document_number, name, profile_updated_at, pii_erased, is_active
       ) VALUES (?, ?, '1', '12345678', 'Erased', '2026-08-01T00:00:00.000Z', 1, 0)`,
    )
      .bind(`c-${tenantId}`, tenantId)
      .run();

    await expect(
      processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        nv(fixture, 'off-pii', {
          clientName: 'Hack',
          clientProfileUpdatedAt: '2026-08-04T14:00:00.000Z',
        }),
        now,
      ),
    ).rejects.toThrow(/CUSTOMER_PII_ERASED/);
  });

  it('batch sync: partial failure + ALREADY_SYNCED', async () => {
    const tenantId = 't-batch-1';
    const fixture = await seed(tenantId);
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const ok = nv(fixture, 'off-batch-ok');
    const bad = nv(fixture, 'off-batch-bad', { series: 'NOPE' });

    const first = await processSyncSalesBatch(env.DB, tenantId, fixture.userId, [ok, bad], now);
    expect(first.results[0]?.status).toBe('SUCCESS');
    expect(first.results[1]?.status).toBe('FAILED');

    const retry = await processSyncSalesBatch(env.DB, tenantId, fixture.userId, [ok], now);
    expect(retry.results[0]?.status).toBe('ALREADY_SYNCED');
  });

  it('edge D: día cerrado rematerializa rollup; 0 doble conteo', async () => {
    const tenantId = 't-edged-1';
    const fixture = await seed(tenantId);
    // Sync 01:00 Lima Aug 5 de venta emitida 23:00 Lima Aug 4 (dentro de skew ±6h).
    const now = Date.parse('2026-08-05T06:00:00.000Z');
    expect(isClosedReportDate('2026-08-04', now)).toBe(true);

    const deleted: string[] = [];
    const kv = {
      delete: (k: string) => {
        deleted.push(k);
        return Promise.resolve();
      },
    };

    await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      nv(fixture, 'off-edge-1', {
        issuedAt: '2026-08-05T04:00:00.000Z', // 23:00 Lima Aug 4
      }),
      now,
      kv,
    );

    const rollup = await env.DB.prepare(
      `SELECT gross_sales_cents, doc_count FROM daily_financial_rollups
       WHERE tenant_id = ? AND branch_id = ? AND report_date = '2026-08-04'`,
    )
      .bind(tenantId, fixture.branchId)
      .first<{ gross_sales_cents: number; doc_count: number }>();
    expect(rollup?.doc_count).toBe(1);
    expect(rollup?.gross_sales_cents).toBe(1180);
    expect(deleted).toContain('insights:t-edged-1:2026-08-04');

    // Rematerialize again — same totals (idempotent)
    await rematerializeDailyRollupIfClosedDay(
      env.DB,
      tenantId,
      fixture.branchId,
      '2026-08-04 23:00:00',
      now,
    );
    const again = await env.DB.prepare(
      `SELECT gross_sales_cents, doc_count FROM daily_financial_rollups
       WHERE tenant_id = ? AND branch_id = ? AND report_date = '2026-08-04'`,
    )
      .bind(tenantId, fixture.branchId)
      .first<{ gross_sales_cents: number; doc_count: number }>();
    expect(again?.doc_count).toBe(1);
    expect(again?.gross_sales_cents).toBe(1180);

    const product = await env.DB.prepare(
      `SELECT product_id, qty, gross_cents FROM daily_product_rollups
       WHERE tenant_id = ? AND branch_id = ? AND report_date = '2026-08-04'`,
    )
      .bind(tenantId, fixture.branchId)
      .first<{ product_id: string; qty: number; gross_cents: number }>();
    expect(product?.product_id).toBe(fixture.productId);
    expect(product?.gross_cents).toBeGreaterThan(0);

    // Cron 2× Promise.all — mismo SoT, 0 duplicados PK
    const shards = [
      { shardKey: 'A', db: env.DB },
      { shardKey: 'B', db: env.DB },
    ];
    const cronAt = Date.parse('2026-08-05T08:00:00.000Z');
    const firstCron = await runDailyRollupsCron(shards, cronAt);
    const secondCron = await runDailyRollupsCron(shards, cronAt);
    expect(firstCron.reportDate).toBe('2026-08-04');
    expect(secondCron.shards.map((s) => s.grossSalesCents)).toEqual(
      firstCron.shards.map((s) => s.grossSalesCents),
    );
    const pkCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM daily_financial_rollups
       WHERE tenant_id = ? AND branch_id = ? AND report_date = '2026-08-04'`,
    )
      .bind(tenantId, fixture.branchId)
      .first<{ n: number }>();
    expect(pkCount?.n).toBe(1);
  });
});
