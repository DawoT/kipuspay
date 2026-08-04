import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { InsufficientStockError, type OfflineSalePayload } from '@kipuspay/domain-sales';
import { processOfflineSaleAtomic } from './process-offline-sale-atomic.js';

async function seedNvFixture(tenantId: string): Promise<{
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
    ).bind(tenantId, 'ACID SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
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
       VALUES (?, ?, ?, ?, 'physical', 'NIU', 1000, 400, 0, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto'),
    env.DB.prepare(
      `INSERT INTO branch_product_stock
         (tenant_id, branch_id, product_id, stock, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 10, 400)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
  ]);

  return { branchId, sessionId, userId, productId, paymentMethodId };
}

function nvPayload(
  fixture: Awaited<ReturnType<typeof seedNvFixture>>,
  offlineSaleId: string,
  qty: number,
  amountCents: number,
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
    items: [{ productId: fixture.productId, quantity: qty }],
    payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents }],
  };
}

describe('processOfflineSaleAtomic NV (Sprint 4)', () => {
  it('SUCCESS descuenta stock y asigna correlativo', async () => {
    const fixture = await seedNvFixture('t-acid-ok');
    const payload = nvPayload(fixture, 'off-ok', 2, 2360);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processOfflineSaleAtomic(
      env.DB,
      't-acid-ok',
      fixture.userId,
      payload,
      now,
    );

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.number).toBe(1);
    expect(result.authoritativeTotalAmount).toBe(2360);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-ok', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(8);
  });

  it('reintento duplicado → ALREADY_SYNCED sin doble efecto', async () => {
    const fixture = await seedNvFixture('t-acid-dup');
    const payload = nvPayload(fixture, 'off-dup', 1, 1180);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const first = await processOfflineSaleAtomic(
      env.DB,
      't-acid-dup',
      fixture.userId,
      payload,
      now,
    );
    expect(first.status).toBe('SUCCESS');

    const second = await processOfflineSaleAtomic(
      env.DB,
      't-acid-dup',
      fixture.userId,
      payload,
      now,
    );
    expect(second.status).toBe('ALREADY_SYNCED');

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind('t-acid-dup', 'off-dup')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-dup', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(9);
  });

  it('stock insuficiente → InsufficientStockError', async () => {
    const fixture = await seedNvFixture('t-acid-stock');
    const payload = nvPayload(fixture, 'off-stock', 99, 116820);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processOfflineSaleAtomic(env.DB, 't-acid-stock', fixture.userId, payload, now),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('sesión cerrada → error', async () => {
    const fixture = await seedNvFixture('t-acid-sess');
    await env.DB.prepare(`UPDATE cash_register_sessions SET status = 'CLOSED' WHERE id = ?`)
      .bind(fixture.sessionId)
      .run();
    const payload = nvPayload(fixture, 'off-sess', 1, 1180);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processOfflineSaleAtomic(env.DB, 't-acid-sess', fixture.userId, payload, now),
    ).rejects.toThrow(/Invalid or closed/);
  });

  it('skew > 6h → ISSUED_AT_SKEW_VIOLATION', async () => {
    const fixture = await seedNvFixture('t-acid-skew');
    const payload = {
      ...nvPayload(fixture, 'off-skew', 1, 1180),
      issuedAt: '2026-08-01T00:00:00.000Z',
    };
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processOfflineSaleAtomic(env.DB, 't-acid-skew', fixture.userId, payload, now),
    ).rejects.toThrow(/ISSUED_AT_SKEW_VIOLATION/);
  });

  it('chaos concurrent-writers: Promise.all N ventas mismo SKU (stock coherente)', async () => {
    const fixture = await seedNvFixture('t-acid-conc');
    await env.DB.prepare(
      `UPDATE branch_product_stock SET stock = 5 WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-conc', fixture.productId)
      .run();

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const attempts = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        try {
          const r = await processOfflineSaleAtomic(
            env.DB,
            't-acid-conc',
            fixture.userId,
            nvPayload(fixture, `off-conc-${i}`, 1, 1180),
            now,
          );
          return { ok: r.status === 'SUCCESS', offlineSaleId: `off-conc-${i}` };
        } catch {
          return { ok: false, offlineSaleId: `off-conc-${i}` };
        }
      }),
    );

    const successes = attempts.filter((a) => a.ok).length;
    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-conc', fixture.productId)
      .first<{ stock: number }>();
    const saleCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
      .bind('t-acid-conc')
      .first<{ n: number }>();

    expect(successes).toBe(5);
    expect(stock?.stock).toBe(0);
    expect(saleCount?.n).toBe(5);
  });

  it('chaos concurrent-writers: sobre-demanda no deja stock negativo', async () => {
    const fixture = await seedNvFixture('t-acid-race');
    await env.DB.prepare(
      `UPDATE branch_product_stock SET stock = 2 WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-race', fixture.productId)
      .run();

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const attempts = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        try {
          const r = await processOfflineSaleAtomic(
            env.DB,
            't-acid-race',
            fixture.userId,
            nvPayload(fixture, `off-race-${i}`, 1, 1180),
            now,
          );
          return r.status === 'SUCCESS';
        } catch {
          return false;
        }
      }),
    );

    const successes = attempts.filter(Boolean).length;
    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-race', fixture.productId)
      .first<{ stock: number }>();
    const saleCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
      .bind('t-acid-race')
      .first<{ n: number }>();

    expect(successes).toBe(2);
    expect(stock?.stock).toBe(0);
    expect(saleCount?.n).toBe(2);
  });
});
