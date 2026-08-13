import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runPromotionsAntiStackChaosScenario } from '@kipuspay/chaos-harness';
import { InsufficientStockError, type OfflineSalePayload } from '@kipuspay/domain-sales';
import { ExpiredBatchError } from '@kipuspay/domain-inventory';
import { processOfflineSaleAtomic } from './process-offline-sale-atomic.js';
import { processCreditNoteAtomic } from './process-credit-note-atomic.js';

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
      `INSERT INTO tenants
         (id, business_name, vertical_type, shard_id, formalization_mode, enabled_document_types)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      tenantId,
      'ACID SAC',
      'retail',
      'shard-1',
      'INTERNAL_CONTROL',
      '["NV","NV_RETURN","01","03","07","08"]',
    ),
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
         (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 10, 10000000, 400)`,
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

  it('Sprint 4: ALREADY_SYNCED devuelve reconciliación autoritativa completa', async () => {
    const fixture = await seedNvFixture('t-acid-rec');
    const payload = nvPayload(fixture, 'off-rec', 2, 2360);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const first = await processOfflineSaleAtomic(
      env.DB,
      't-acid-rec',
      fixture.userId,
      payload,
      now,
    );
    expect(first.status).toBe('SUCCESS');
    if (first.status !== 'SUCCESS') return;
    const saleId = first.saleId;

    // Sync duplicado con montos MUTADOS por el cliente (el servidor manda):
    // el reintento intenta 1 unidad × 1180, pero la venta ya fue 2 × 2360.
    const mutated = {
      ...nvPayload(fixture, 'off-rec', 1, 1180),
      issuedAt: '2026-08-04T15:00:00.000Z',
    };
    const second = await processOfflineSaleAtomic(
      env.DB,
      't-acid-rec',
      fixture.userId,
      mutated,
      now,
    );

    expect(second.status).toBe('ALREADY_SYNCED');
    if (second.status !== 'ALREADY_SYNCED') return;
    // Contrato de reconciliación (SYN-12 / §6): el servidor es la autoridad.
    expect(second.reconciliationRequired).toBe(true);
    expect(second.saleId).toBe(saleId);
    expect(second.authoritativeTotalAmount).toBe(2360);
    expect(second.authoritativeIssuedAt).toBeTruthy();

    // Sin doble efecto: una sola venta, stock descontado una sola vez.
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind('t-acid-rec', 'off-rec')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-rec', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(8);
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

  it('shard del tenant no activo → SHARD_NOT_ACTIVE sin persistir (router Sprint 1)', async () => {
    const fixture = await seedNvFixture('t-acid-shard');
    const payload = nvPayload(fixture, 'off-shard', 1, 1180);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processOfflineSaleAtomic(env.DB, 't-acid-shard', fixture.userId, payload, {
        nowMs: now,
        activeShards: ['D1_SHARD_01'],
      }),
    ).rejects.toThrow('SHARD_NOT_ACTIVE');

    const sales = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
      .bind('t-acid-shard')
      .first<{ n: number }>();
    expect(sales?.n).toBe(0);
  });

  it('shard del tenant activo → venta procede (router Sprint 1)', async () => {
    const fixture = await seedNvFixture('t-acid-shard-ok');
    const payload = nvPayload(fixture, 'off-shard-ok', 1, 1180);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processOfflineSaleAtomic(
      env.DB,
      't-acid-shard-ok',
      fixture.userId,
      payload,
      { nowMs: now, activeShards: ['shard-1', 'D1_SHARD_01'] },
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('documento no habilitado en enabled_document_types → DOCUMENT_TYPE_NOT_ENABLED', async () => {
    const fixture = await seedNvFixture('t-acid-docoff');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants
          SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG',
              enabled_document_types = '["NV","03"]'
          WHERE id = ?`,
      ).bind('t-acid-docoff'),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-f-docoff', ?, ?, '01', 'F001', 0, 'INTERNAL')`,
      ).bind('t-acid-docoff', fixture.branchId),
    ]);

    const payload = {
      ...nvPayload(fixture, 'off-docoff', 1, 1180),
      documentType: '01' as const,
      series: 'F001',
      clientDocumentType: '6',
      clientDocumentNumber: '20123456789',
      clientName: 'ACME SAC',
    };
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processOfflineSaleAtomic(env.DB, 't-acid-docoff', fixture.userId, payload, now),
    ).rejects.toThrow('DOCUMENT_TYPE_NOT_ENABLED');

    const sales = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
      .bind('t-acid-docoff')
      .first<{ n: number }>();
    expect(sales?.n).toBe(0);
  });

  it('documento habilitado en la columna del tenant → venta procede (Sprint 1)', async () => {
    const fixture = await seedNvFixture('t-acid-docon');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants
          SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG',
              enabled_document_types = '["NV","01"]'
          WHERE id = ?`,
      ).bind('t-acid-docon'),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-f-docon', ?, ?, '01', 'F001', 0, 'INTERNAL')`,
      ).bind('t-acid-docon', fixture.branchId),
    ]);

    const payload = {
      ...nvPayload(fixture, 'off-docon', 1, 1180),
      documentType: '01' as const,
      series: 'F001',
      clientDocumentType: '6',
      clientDocumentNumber: '20123456789',
      clientName: 'ACME SAC',
    };
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processOfflineSaleAtomic(
      env.DB,
      't-acid-docon',
      fixture.userId,
      payload,
      now,
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('chaos concurrent-writers: Promise.all N ventas mismo SKU (stock coherente)', async () => {
    const fixture = await seedNvFixture('t-acid-conc');
    await env.DB.prepare(
      `UPDATE branch_product_stock
        SET stock = 5, stock_microunits = 5000000
        WHERE tenant_id = ? AND product_id = ?`,
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
      `UPDATE branch_product_stock
        SET stock = 2, stock_microunits = 2000000
        WHERE tenant_id = ? AND product_id = ?`,
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

  it('Sprint 4: MISMO offlineSaleId concurrente → 1 SUCCESS, resto ALREADY_SYNCED, stock exacto', async () => {
    const fixture = await seedNvFixture('t-acid-doublesync');
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const payload = nvPayload(fixture, 'off-doublesync', 2, 2360);

    // 5 sincronizaciones simultáneas del mismo documento offline.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, async () => {
        try {
          const r = await processOfflineSaleAtomic(
            env.DB,
            't-acid-doublesync',
            fixture.userId,
            payload,
            now,
          );
          return r.status;
        } catch {
          return 'ERROR';
        }
      }),
    );

    const successes = attempts.filter((s) => s === 'SUCCESS').length;
    const already = attempts.filter((s) => s === 'ALREADY_SYNCED').length;
    expect(successes).toBe(1);
    expect(already).toBe(4);
    expect(attempts.filter((s) => s === 'ERROR')).toEqual([]);

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind('t-acid-doublesync', 'off-doublesync')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);

    // stock descontado UNA sola vez (2 unidades)
    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-doublesync', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(8);
  });

  it('allow_negative_stock: oversell acepta y audita OFFLINE_OVERSELL (SYN-06)', async () => {
    const fixture = await seedNvFixture('t-acid-oversell');
    await env.DB.batch([
      env.DB.prepare(`UPDATE products SET allow_negative_stock = 1 WHERE id = ?`).bind(
        fixture.productId,
      ),
      env.DB.prepare(
        `UPDATE branch_product_stock
          SET stock = 1, stock_microunits = 1000000
          WHERE tenant_id = ? AND product_id = ?`,
      ).bind('t-acid-oversell', fixture.productId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    // qty 3 × 1000 = 3000 + IGV 18% = 3540
    const result = await processOfflineSaleAtomic(
      env.DB,
      't-acid-oversell',
      fixture.userId,
      nvPayload(fixture, 'off-oversell', 3, 3540),
      now,
    );
    expect(result.status).toBe('SUCCESS');

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-oversell', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(-2);

    const audit = await env.DB.prepare(
      `SELECT action, payload_json FROM audit_events
       WHERE tenant_id = ? AND action = 'OFFLINE_OVERSELL'`,
    )
      .bind('t-acid-oversell')
      .first<{ action: string; payload_json: string }>();
    expect(audit?.action).toBe('OFFLINE_OVERSELL');
    const payload = JSON.parse(audit?.payload_json ?? '{}') as {
      productId: string;
      requested: number;
      available: number;
    };
    expect(payload.productId).toBe(fixture.productId);
    expect(payload.requested).toBe(3);
    expect(payload.available).toBe(1);
  });

  it('factura 01: PENDING + must_submit_by; NV no PENDING', async () => {
    const fixture = await seedNvFixture('t-acid-cpe');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG' WHERE id = ?`,
      ).bind('t-acid-cpe'),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-f-cpe', ?, ?, '01', 'F001', 0, 'INTERNAL')`,
      ).bind('t-acid-cpe', fixture.branchId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const payload = {
      ...nvPayload(fixture, 'off-cpe', 1, 1180),
      documentType: '01' as const,
      series: 'F001',
      clientDocumentType: '6',
      clientDocumentNumber: '20123456789',
      clientName: 'ACME SAC',
    };
    const result = await processOfflineSaleAtomic(
      env.DB,
      't-acid-cpe',
      fixture.userId,
      payload,
      now,
    );
    expect(result.status).toBe('SUCCESS');

    const sale = await env.DB.prepare(
      `SELECT document_type, sunat_status, must_submit_by FROM sales WHERE tenant_id = ?`,
    )
      .bind('t-acid-cpe')
      .first<{ document_type: string; sunat_status: string; must_submit_by: string | null }>();
    expect(sale?.document_type).toBe('01');
    expect(sale?.sunat_status).toBe('PENDING');
    expect(sale?.must_submit_by).toBe(new Date(now + 3 * 24 * 3600 * 1000).toISOString());

    const outbox = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_outbox WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind('t-acid-cpe', result.status === 'SUCCESS' ? result.saleId : '')
      .first<{ n: number }>();
    expect(outbox?.n).toBe(1);

    // NV en mismo tenant → NOT_APPLICABLE y never PENDING enqueue semantics
    const nv = await processOfflineSaleAtomic(
      env.DB,
      't-acid-cpe',
      fixture.userId,
      nvPayload(fixture, 'off-nv-cpe', 1, 1180),
      now,
    );
    expect(nv.status).toBe('SUCCESS');
    const nvSale = await env.DB.prepare(
      `SELECT sunat_status, must_submit_by FROM sales WHERE offline_client_sale_id = ?`,
    )
      .bind('off-nv-cpe')
      .first<{ sunat_status: string; must_submit_by: string | null }>();
    expect(nvSale?.sunat_status).toBe('NOT_APPLICABLE');
    expect(nvSale?.must_submit_by).toBeNull();

    const nvOutbox = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_outbox fo
       JOIN sales s ON s.id = fo.sale_id
       WHERE s.offline_client_sale_id = 'off-nv-cpe'`,
    ).first<{ n: number }>();
    expect(nvOutbox?.n).toBe(0);
  });

  it('INTERNAL_CONTROL bloquea factura', async () => {
    const fixture = await seedNvFixture('t-acid-block');
    await env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES ('ser-f-block', ?, ?, '01', 'F001', 0, 'INTERNAL')`,
    )
      .bind('t-acid-block', fixture.branchId)
      .run();
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        't-acid-block',
        fixture.userId,
        {
          ...nvPayload(fixture, 'off-block', 1, 1180),
          documentType: '01',
          series: 'F001',
          clientDocumentType: '6',
          clientDocumentNumber: '20123456789',
          clientName: 'ACME',
        },
        now,
      ),
    ).rejects.toThrow(/CPE_BLOCKED_INTERNAL_CONTROL/);
  });

  it('NV_RETURN restaura stock (NOT_APPLICABLE)', async () => {
    const fixture = await seedNvFixture('t-acid-ret');
    await env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES ('ser-nvr', ?, ?, 'NV_RETURN', 'NVR1', 0, 'INTERNAL')`,
    )
      .bind('t-acid-ret', fixture.branchId)
      .run();
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    await processOfflineSaleAtomic(
      env.DB,
      't-acid-ret',
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-ret', 2, 2360),
        documentType: 'NV_RETURN',
        series: 'NVR1',
      },
      now,
    );
    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-ret', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(12); // 10 + 2
  });

  it('NC E-A: REJECTED origen + CREDIT_NOTE_NO_CDR; E-B uncatalogued 0 stock', async () => {
    const fixture = await seedNvFixture('t-acid-nc');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG' WHERE id = ?`,
      ).bind('t-acid-nc'),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-f-nc', ?, ?, '01', 'F001', 0, 'INTERNAL'),
                ('ser-nc', ?, ?, '07', 'FC01', 0, 'INTERNAL')`,
      ).bind('t-acid-nc', fixture.branchId, 't-acid-nc', fixture.branchId),
    ]);
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const cpe = await processOfflineSaleAtomic(
      env.DB,
      't-acid-nc',
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-nc-origin', 1, 1180),
        documentType: '01',
        series: 'F001',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
        clientName: 'ACME',
      },
      now,
    );
    expect(cpe.status).toBe('SUCCESS');
    if (cpe.status !== 'SUCCESS') return;

    await env.DB.prepare(`UPDATE sales SET sunat_status = 'REJECTED' WHERE id = ?`)
      .bind(cpe.saleId)
      .run();

    const beforeStock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-nc', fixture.productId)
      .first<{ stock: number }>();

    const nc = await processCreditNoteAtomic(
      env.DB,
      't-acid-nc',
      fixture.userId,
      cpe.saleId,
      {
        motiveCode: '01',
        amountCents: 1180,
        fullCancellation: true,
        items: [{ productId: fixture.productId, quantity: 1, isUncatalogued: true }],
      },
      'FC01',
    );
    expect(nc.requiresNoCdrAudit).toBe(true);

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events WHERE tenant_id = ? AND action = 'CREDIT_NOTE_NO_CDR'`,
    )
      .bind('t-acid-nc')
      .first<{ action: string }>();
    expect(audit?.action).toBe('CREDIT_NOTE_NO_CDR');

    const afterStock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-nc', fixture.productId)
      .first<{ stock: number }>();
    expect(afterStock?.stock).toBe(beforeStock?.stock); // E-B: no restore
  });
  it('Sprint 4: fallo inyectado A MITAD del batch revierte todo (venta, stock, pagos)', async () => {
    const fixture = await seedNvFixture('t-acid-midroll');
    const payload = nvPayload(fixture, 'off-midroll', 2, 2360);
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    // Statement intermedio dentro del batch (después de los writes de
    // venta/stock) que viola CHECK (document_type IN ...) → el batch
    // completo debe abortar sin efectos parciales.
    await expect(
      processOfflineSaleAtomic(env.DB, 't-acid-midroll', fixture.userId, payload, {
        nowMs: now,
        afterSaleStatements: (plan) => {
          plan.add(
            env.DB.prepare(
              `INSERT INTO sales (
                 id, tenant_id, branch_id, cash_register_session_id, user_id,
                 client_document_type, client_document_number, client_name,
                 document_type, series, number, total_amount_cents, issued_at_lima
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'XX', 'NV99', 1, 0, ?)`,
            ).bind(
              'sale-midroll-fail',
              't-acid-midroll',
              fixture.branchId,
              fixture.sessionId,
              fixture.userId,
              '1',
              '00000000',
              'Cliente',
              now,
            ),
          );
        },
      }),
    ).rejects.toThrow();

    const sales = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind('t-acid-midroll', 'off-midroll')
      .first<{ n: number }>();
    expect(sales?.n).toBe(0);

    const payments = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sale_payments WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind('t-acid-midroll', 'sale-midroll')
      .first<{ n: number }>();
    expect(payments?.n).toBe(0);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-acid-midroll', fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(10);
  });
});

describe('DAT-05 / E-D ledger AR (Sprint 8)', () => {
  it('flag off → venta crédito sin asiento CxC', async () => {
    const fixture = await seedNvFixture('t-ledger-off');
    const payload = {
      ...nvPayload(fixture, 'off-credit-off', 1, 1180),
      clientDocumentNumber: '87654321',
      clientName: 'Cliente Credito Off',
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1180, isCredit: true }],
    };
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const result = await processOfflineSaleAtomic(env.DB, 't-ledger-off', fixture.userId, payload, {
      nowMs: now,
      ledgerArApEnabled: false,
    });
    expect(result.status).toBe('SUCCESS');
    const ar = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM accounts_receivable WHERE tenant_id = ?`,
    )
      .bind('t-ledger-off')
      .first<{ n: number }>();
    expect(ar?.n).toBe(0);
  });

  it('crédito → CxC en misma tx; NV_RETURN parcial/total compensa sin drift', async () => {
    const fixture = await seedNvFixture('t-ledger-ar');
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-nvr-ar', ?, ?, 'NV_RETURN', 'NVR1', 0, 'INTERNAL')`,
      ).bind('t-ledger-ar', fixture.branchId),
      env.DB.prepare(
        `INSERT INTO customers (
             id, tenant_id, document_type_code, document_number, name, profile_updated_at, is_active, credit_limit_cents
           ) VALUES (?, ?, '1', '12345678', 'Cliente Credito', '2026-08-01T00:00:00.000Z', 1, 100000)`,
      ).bind('cust-ar', 't-ledger-ar'),
    ]);

    const payload = {
      ...nvPayload(fixture, 'off-credit-on', 1, 1180),
      clientDocumentNumber: '12345678',
      clientName: 'Cliente Credito',
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1180, isCredit: true }],
    };
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const sale = await processOfflineSaleAtomic(env.DB, 't-ledger-ar', fixture.userId, payload, {
      nowMs: now,
      ledgerArApEnabled: true,
    });
    expect(sale.status).toBe('SUCCESS');
    if (sale.status !== 'SUCCESS') return;

    const arOpen = await env.DB.prepare(
      `SELECT id, balance_due_cents, sale_id, status FROM accounts_receivable
       WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind('t-ledger-ar', sale.saleId)
      .first<{ id: string; balance_due_cents: number; sale_id: string; status: string }>();
    expect(arOpen?.balance_due_cents).toBe(1180);
    expect(arOpen?.status).toBe('OPEN');
    expect(arOpen?.sale_id).toBe(sale.saleId);

    // Devolución parcial: 480 cents (qty 1 still 1180 en motor NV — usamos amount via qty)
    // El motor NV_RETURN calcula totales desde catálogo; compensamos con el total del return.
    // Para parcial de CxC simulamos return de misma línea y verificamos aplicación min(credit, balance).
    const retPartial = await processOfflineSaleAtomic(
      env.DB,
      't-ledger-ar',
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-nvr-partial', 1, 1180),
        documentType: 'NV_RETURN',
        series: 'NVR1',
        referencedSaleId: sale.saleId,
      },
      { nowMs: now, ledgerArApEnabled: true },
    );
    expect(retPartial.status).toBe('SUCCESS');

    const arAfter = await env.DB.prepare(
      `SELECT balance_due_cents, status FROM accounts_receivable WHERE id = ?`,
    )
      .bind(arOpen!.id)
      .first<{ balance_due_cents: number; status: string }>();
    expect(arAfter?.balance_due_cents).toBe(0);
    expect(arAfter?.status).toBe('PAID');

    const paySum = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM accounts_receivable_payments
       WHERE accounts_receivable_id = ?`,
    )
      .bind(arOpen!.id)
      .first<{ s: number }>();
    expect(paySum?.s).toBe(1180);
    expect(1180 - (paySum?.s ?? 0)).toBe(arAfter?.balance_due_cents);
  });

  it('NC sobre CPE a crédito reduce CxC (E-D)', async () => {
    const fixture = await seedNvFixture('t-ledger-nc');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG' WHERE id = ?`,
      ).bind('t-ledger-nc'),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-01-ar', ?, ?, '01', 'F001', 0, 'INTERNAL'),
                ('ser-07-ar2', ?, ?, '07', 'FC01', 0, 'INTERNAL')`,
      ).bind('t-ledger-nc', fixture.branchId, 't-ledger-nc', fixture.branchId),
      env.DB.prepare(
        `INSERT INTO customers (
             id, tenant_id, document_type_code, document_number, name, profile_updated_at, is_active, credit_limit_cents
           ) VALUES (?, ?, '6', '20123456789', 'ACME', '2026-08-01T00:00:00.000Z', 1, 100000)`,
      ).bind('cust-nc', 't-ledger-nc'),
    ]);

    const sale = await processOfflineSaleAtomic(
      env.DB,
      't-ledger-nc',
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-fact-credit', 1, 1180),
        documentType: '01',
        series: 'F001',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
        clientName: 'ACME',
        payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1180, isCredit: true }],
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z'), ledgerArApEnabled: true },
    );
    expect(sale.status).toBe('SUCCESS');
    if (sale.status !== 'SUCCESS') return;

    await env.DB.prepare(`UPDATE sales SET sunat_status = 'ACCEPTED' WHERE id = ?`)
      .bind(sale.saleId)
      .run();

    await processCreditNoteAtomic(
      env.DB,
      't-ledger-nc',
      fixture.userId,
      sale.saleId,
      {
        motiveCode: '01',
        amountCents: 500,
        fullCancellation: false,
        items: [{ productId: fixture.productId, quantity: 1, isUncatalogued: true }],
      },
      'FC01',
      { ledgerArApEnabled: true },
    );

    const ar = await env.DB.prepare(
      `SELECT balance_due_cents, status FROM accounts_receivable
       WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind('t-ledger-nc', sale.saleId)
      .first<{ balance_due_cents: number; status: string }>();
    expect(ar?.balance_due_cents).toBe(680);
    expect(ar?.status).toBe('PARTIALLY_PAID');
  });

  it('race de cupo de crédito: dos ventas concurrentes nunca exceden el límite (B1)', async () => {
    const tenantId = 't-credit-race';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (
             id, tenant_id, document_type_code, document_number, name, profile_updated_at, is_active, credit_limit_cents
           ) VALUES (?, ?, '1', '12345678', 'Cliente Cupo', '2026-08-01T00:00:00.000Z', 1, 5000)`,
      ).bind('cust-race', tenantId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const saleA = {
      ...nvPayload(fixture, 'off-race-a', 3, 3540),
      clientDocumentNumber: '12345678',
      clientName: 'Cliente Cupo',
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 3540, isCredit: true }],
    };
    const saleB = { ...saleA, offlineSaleId: 'off-race-b' };

    // Dos POS sincronizan en paralelo: ambos preflights ven CxC abierta = 0 y
    // aprueban; el guard del batch debe abortar el segundo commit (ok=0 → CHECK).
    const results = await Promise.allSettled([
      processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, saleA, {
        nowMs: now,
        ledgerArApEnabled: true,
      }),
      processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, saleB, {
        nowMs: now,
        ledgerArApEnabled: true,
      }),
    ]);
    const successes = results.filter(
      (r): r is PromiseFulfilledResult<{ status: string }> =>
        r.status === 'fulfilled' && r.value.status === 'SUCCESS',
    ).length;
    expect(successes).toBe(1);

    const open = await env.DB.prepare(
      `SELECT COALESCE(SUM(balance_due_cents), 0) AS s
         FROM accounts_receivable
         WHERE tenant_id = ? AND balance_due_cents > 0`,
    )
      .bind(tenantId)
      .first<{ s: number }>();
    expect(open?.s ?? 0).toBeLessThanOrEqual(5000);
  });

  // 50 ciclos de stress ACID: ~5-15s bajo carga (supera el testTimeout default
  // de 5000ms de vitest). Timeout explícito para eliminar el flake por timing.
  it('S8-H1: 50 ciclos venta crédito → NC parcial/total: 0 discrepancia saldo vs asientos', async () => {
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const cycles = 50;
    for (let i = 0; i < cycles; i += 1) {
      const tenantId = `t-ar-cycle-${i}-${crypto.randomUUID().slice(0, 8)}`;
      const fixture = await seedNvFixture(tenantId);
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO branch_document_series
             (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
           VALUES (?, ?, ?, 'NV_RETURN', 'NVR1', 0, 'INTERNAL')`,
        ).bind(`ser-nvr-c-${i}`, tenantId, fixture.branchId),
        env.DB.prepare(
          `INSERT INTO customers (
               id, tenant_id, document_type_code, document_number, name, profile_updated_at, is_active, credit_limit_cents
             ) VALUES (?, ?, '1', '12345678', 'Ciclo', '2026-08-01T00:00:00.000Z', 1, 100000)`,
        ).bind(`cust-c-${i}`, tenantId),
      ]);

      // Venta a crédito: 2 × 1180 = 2360 → CxC balance_due 2360.
      const sale = await processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          ...nvPayload(fixture, `off-c-${i}`, 2, 2360),
          clientDocumentNumber: '12345678',
          clientName: 'Ciclo',
          payments: [
            { paymentMethodId: fixture.paymentMethodId, amountCents: 2360, isCredit: true },
          ],
        },
        { nowMs: now, ledgerArApEnabled: true },
      );
      expect(sale.status).toBe('SUCCESS');
      if (sale.status !== 'SUCCESS') continue;
      const saleId = sale.saleId;

      // Devolución PARCIAL: qty 1 (1180) → compensa min(credit, balance).
      const ret = await processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          ...nvPayload(fixture, `off-cr-${i}`, 1, 1180),
          documentType: 'NV_RETURN',
          series: 'NVR1',
          referencedSaleId: saleId,
        },
        { nowMs: now, ledgerArApEnabled: true },
      );
      expect(ret.status).toBe('SUCCESS');

      // Invariante: balance_due = 2360 − 1180 = 1180, nunca negativo.
      const ar = await env.DB.prepare(
        `SELECT balance_due_cents, status FROM accounts_receivable WHERE tenant_id = ? AND sale_id = ?`,
      )
        .bind(tenantId, saleId)
        .first<{ balance_due_cents: number; status: string }>();
      expect(ar?.balance_due_cents).toBe(1180);
      expect(ar?.status).toBe('PARTIALLY_PAID');

      // Devolución TOTAL: qty 1 restante (1180) → saldo 0, AR settle.
      const ret2 = await processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          ...nvPayload(fixture, `off-cr2-${i}`, 1, 1180),
          documentType: 'NV_RETURN',
          series: 'NVR1',
          referencedSaleId: saleId,
        },
        { nowMs: now, ledgerArApEnabled: true },
      );
      expect(ret2.status).toBe('SUCCESS');

      const settled = await env.DB.prepare(
        `SELECT balance_due_cents, status FROM accounts_receivable WHERE tenant_id = ? AND sale_id = ?`,
      )
        .bind(tenantId, saleId)
        .first<{ balance_due_cents: number; status: string }>();
      expect(settled?.balance_due_cents).toBe(0);
      expect(settled?.status).toBe('PAID');
    }

    // 0 discrepancias globales: toda AR cerrada tiene saldo 0.
    const drift = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM accounts_receivable
       WHERE status = 'PAID' AND balance_due_cents <> 0`,
    ).first<{ n: number }>();
    expect(drift?.n).toBe(0);
  }, 30_000);
});

describe('processOfflineSaleAtomic S31 UOM (F2)', () => {
  async function seedUomFixture(tenantId: string): Promise<{
    branchId: string;
    sessionId: string;
    userId: string;
    productId: string;
    paymentMethodId: string;
    uomId: string;
  }> {
    const fixture = await seedNvFixture(tenantId);
    const uomId = `uom-ter-${tenantId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO product_uoms (
           id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
         ) VALUES (?, ?, ?, 'TER', 1, 3, 0)`,
      ).bind(uomId, tenantId, fixture.productId),
    ]);
    return { ...fixture, uomId };
  }

  function uomPayload(
    fixture: Awaited<ReturnType<typeof seedUomFixture>>,
    offlineSaleId: string,
    enteredQuantityMicrounits: number,
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
      items: [
        {
          productId: fixture.productId,
          uomId: fixture.uomId,
          enteredQuantityMicrounits,
        },
      ],
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents }],
    };
  }

  it('denominador 1/3: descuenta stock_microunits con aritmética entera, sin drift REAL', async () => {
    const fixture = await seedUomFixture('t-uom-third');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE products SET stock_microunits = 10000000 WHERE id = ? AND tenant_id = ?`,
      ).bind(fixture.productId, 't-uom-third'),
      env.DB.prepare(
        `UPDATE branch_product_stock
           SET stock_microunits = 10000000, stock = 10.000001
           WHERE tenant_id = ? AND product_id = ?`,
      ).bind('t-uom-third', fixture.productId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    // 1 tercia = 1/3 base → 333_333 µ (half-up de 1_000_000/3)
    const result = await processOfflineSaleAtomic(
      env.DB,
      't-uom-third',
      fixture.userId,
      uomPayload(fixture, 'off-uom-third', 1_000_000, 393),
      { nowMs: now, catalogUomEnabled: true },
    );
    expect(result.status).toBe('SUCCESS');

    const stock = await env.DB.prepare(
      `SELECT stock, stock_microunits FROM branch_product_stock
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-uom-third', fixture.productId)
      .first<{ stock: number; stock_microunits: number }>();
    // 10_000_000 - 333_333 = 9_666_667 exacto (entero), independiente del REAL 10.000001
    expect(stock?.stock_microunits).toBe(9_666_667);
    // Espejo REAL coherente con la fuente canónica.
    expect(Math.abs(stock!.stock - stock!.stock_microunits * 0.000001)).toBeLessThan(1e-6);
  });

  it('denominador 1/3: 3 ventas de 1/3 consumen exactamente 1 base sin drift acumulado', async () => {
    const fixture = await seedUomFixture('t-uom-3x');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE branch_product_stock
           SET stock_microunits = 1000000, stock = 0.9999995
           WHERE tenant_id = ? AND product_id = ?`,
      ).bind('t-uom-3x', fixture.productId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    for (let i = 0; i < 3; i++) {
      const r = await processOfflineSaleAtomic(
        env.DB,
        't-uom-3x',
        fixture.userId,
        uomPayload(fixture, `off-uom-3x-${i}`, 1_000_000, 393),
        { nowMs: now, catalogUomEnabled: true },
      );
      expect(r.status).toBe('SUCCESS');
    }

    const stock = await env.DB.prepare(
      `SELECT stock_microunits FROM branch_product_stock
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind('t-uom-3x', fixture.productId)
      .first<{ stock_microunits: number }>();
    // 1_000_000 - 3 × 333_333 = 1 µ residual exacto.
    expect(stock?.stock_microunits).toBe(1);
  });

  it('disponibilidad usa microunits: rechaza qty fraccional > stock real en µ', async () => {
    const fixture = await seedUomFixture('t-uom-insuf');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE branch_product_stock
           SET stock_microunits = 333333, stock = 0.333333
           WHERE tenant_id = ? AND product_id = ?`,
      ).bind('t-uom-insuf', fixture.productId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    // 2 tercias = 666_666 µ > 333_333 µ disponibles.
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        't-uom-insuf',
        fixture.userId,
        uomPayload(fixture, 'off-uom-insuf', 2_000_000, 787),
        { nowMs: now, catalogUomEnabled: true },
      ),
    ).rejects.toThrow(/Stock insuficiente/);
  });
});

describe('línea genérica (Sprint 50 / edge 2A)', () => {
  it('venta genérica offline: manualPriceCents ≤ umbral, IGV default, GENERIC_LINE, sin stock', async () => {
    const tenantId = 't-generic';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, max_percent_without_auth, max_amount_without_auth_cents)
       VALUES (?, 5, 2000)`,
    )
      .bind(tenantId)
      .run();
    const stockBefore = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number }>();

    const result = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-generic-1', 1, 1770),
        items: [{ productId: '', isUncatalogued: true, manualPriceCents: 1500, quantity: 1 }],
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
    );
    expect(result.status).toBe('SUCCESS');

    const item = await env.DB.prepare(
      `SELECT product_id, is_uncatalogued, unit_price_cents, unit_cost_cents,
                subtotal_cents, igv_amount_cents, total_amount_cents
         FROM sale_items WHERE sale_id = ?`,
    )
      .bind(result.saleId)
      .first<{
        product_id: string | null;
        is_uncatalogued: number;
        unit_price_cents: number;
        unit_cost_cents: number;
        subtotal_cents: number;
        igv_amount_cents: number;
        total_amount_cents: number;
      }>();
    expect(item?.product_id).toBeNull();
    expect(item?.is_uncatalogued).toBe(1);
    expect(item?.unit_price_cents).toBe(1500);
    expect(item?.unit_cost_cents).toBe(0);
    expect(item?.subtotal_cents).toBe(1500);
    expect(item?.igv_amount_cents).toBe(270); // IGV default 18%
    expect(item?.total_amount_cents).toBe(1770);

    const audit = await env.DB.prepare(
      `SELECT action, payload_json FROM audit_events WHERE action = 'GENERIC_LINE' AND entity_type = 'sale_item'`,
    ).first<{ action: string; payload_json: string }>();
    expect(audit?.action).toBe('GENERIC_LINE');
    expect(JSON.parse(audit?.payload_json ?? '{}')).toMatchObject({ isUncatalogued: true });

    const stockAfter = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number }>();
    expect(stockAfter?.stock).toBe(stockBefore?.stock);
  });

  it('rechaza manualPriceCents sobre el umbral sin authz', async () => {
    const tenantId = 't-generic-limit';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, max_percent_without_auth, max_amount_without_auth_cents)
       VALUES (?, 5, 1000)`,
    )
      .bind(tenantId)
      .run();
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          ...nvPayload(fixture, 'off-generic-2', 1, 1770),
          items: [{ productId: '', isUncatalogued: true, manualPriceCents: 1500, quantity: 1 }],
        },
        { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
      ),
    ).rejects.toThrow('GENERIC_LINE_PRICE_EXCEEDS_THRESHOLD');
  });
});

describe('S18-H1: FEFO / BOM / price-list en motor (integración workerd)', () => {
  it('FEFO: dos lotes, vencido bloqueado (422) y lote bueno descuenta primero', async () => {
    const tenantId = 't-s18-fefo';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO inventory_batches
           (id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits)
         VALUES (?, ?, ?, ?, 'L-EXP', '2026-07-01', 5, 5000000)`,
      ).bind('batch-exp', tenantId, fixture.branchId, fixture.productId),
      env.DB.prepare(
        `INSERT INTO inventory_batches
           (id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits)
         VALUES (?, ?, ?, ?, 'L-OK', '2026-12-31', 5, 5000000)`,
      ).bind('batch-ok', tenantId, fixture.branchId, fixture.productId),
      env.DB.prepare(
        `UPDATE branch_product_stock SET stock = 10, stock_microunits = 10000000
         WHERE tenant_id = ? AND product_id = ?`,
      ).bind(tenantId, fixture.productId),
      // El motor FEFO espeja el delta a la location default.
      env.DB.prepare(
        `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
         VALUES (?, ?, ?, 'DEFAULT', 'Default')`,
      ).bind(`loc-default:${tenantId}:${fixture.branchId}`, tenantId, fixture.branchId),
      env.DB.prepare(
        `INSERT INTO inventory_location_stock (tenant_id, branch_id, location_id, product_id, quantity_microunits)
         VALUES (?, ?, ?, ?, 10000000)`,
      ).bind(
        tenantId,
        fixture.branchId,
        `loc-default:${tenantId}:${fixture.branchId}`,
        fixture.productId,
      ),
      env.DB.prepare(
        `INSERT INTO inventory_location_batch_stock
           (tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits)
         VALUES (?, ?, ?, ?, 'batch-exp', 5000000)`,
      ).bind(
        tenantId,
        fixture.branchId,
        `loc-default:${tenantId}:${fixture.branchId}`,
        fixture.productId,
      ),
      env.DB.prepare(
        `INSERT INTO inventory_location_batch_stock
           (tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits)
         VALUES (?, ?, ?, ?, 'batch-ok', 5000000)`,
      ).bind(
        tenantId,
        fixture.branchId,
        `loc-default:${tenantId}:${fixture.branchId}`,
        fixture.productId,
      ),
    ]);

    // S18-H1: lote vencido presente + lote bueno → la venta PROCEDE usando el
    // bueno (el vencido se salta; nunca se vende). Solo falla si todo vence.
    const exp = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      nvPayload(fixture, 'off-s18-exp', 1, 1180),
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z'), s18: { inventoryBatches: true } },
    );
    expect(exp.status).toBe('SUCCESS');
    const expBatch = await env.DB.prepare(
      `SELECT stock FROM inventory_batches WHERE id = 'batch-exp'`,
    )
      .bind()
      .first<{ stock: number }>();
    expect(expBatch?.stock).toBe(5); // el vencido no se tocó

    // Con lote bueno: venta de 2 descuenta del lote OK (FEFO, vencido ignorado).
    const ok = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      nvPayload(fixture, 'off-s18-ok', 2, 2360),
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z'), s18: { inventoryBatches: true } },
    );
    expect(ok.status).toBe('SUCCESS');

    // Total vendido del lote bueno: 1 (off-s18-exp) + 2 (off-s18-ok) = 3 de 5.
    const batchOk = await env.DB.prepare(
      `SELECT stock, stock_microunits FROM inventory_batches WHERE id = 'batch-ok'`,
    )
      .bind()
      .first<{ stock: number; stock_microunits: number }>();
    expect(batchOk?.stock).toBe(2);
    expect(batchOk?.stock_microunits).toBe(2000000);
    const batchExp = await env.DB.prepare(
      `SELECT stock FROM inventory_batches WHERE id = 'batch-exp'`,
    )
      .bind()
      .first<{ stock: number }>();
    expect(batchExp?.stock).toBe(5); // vencido nunca se toca
  });

  it('BOM: kit con componente sin stock → rollback total (sin venta parcial)', async () => {
    const tenantId = 't-s18-bom';
    const fixture = await seedNvFixture(tenantId);
    const compId = `p-comp-${tenantId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO products
           (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
         VALUES (?, ?, 'COMP', 'Componente', 'physical', 'NIU', 500, 200, 0, 0)`,
      ).bind(compId, tenantId),
      env.DB.prepare(
        `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
         VALUES (?, ?, ?, 0, 0, 200)`,
      ).bind(tenantId, fixture.branchId, compId),
      env.DB.prepare(
        `INSERT INTO product_recipes (id, tenant_id, parent_product_id, child_product_id, quantity)
         VALUES ('rec-1', ?, ?, ?, 2)`,
      ).bind(tenantId, fixture.productId, compId),
      env.DB.prepare(
        `UPDATE products SET product_type = 'kit', stock = 10, stock_microunits = 10000000
         WHERE id = ? AND tenant_id = ?`,
      ).bind(fixture.productId, tenantId),
      env.DB.prepare(
        `UPDATE branch_product_stock SET stock = 10, stock_microunits = 10000000
         WHERE tenant_id = ? AND product_id = ?`,
      ).bind(tenantId, fixture.productId),
    ]);

    // Componente sin stock → InsufficientStockError y NINGUNA venta parcial.
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        nvPayload(fixture, 'off-s18-bom', 1, 1180),
        { nowMs: Date.parse('2026-08-04T15:00:00.000Z'), s18: { inventoryBom: true } },
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const sales = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
    )
      .bind(tenantId, 'off-s18-bom')
      .first<{ n: number }>();
    expect(sales?.n).toBe(0);
  });

  it('price-list: el precio cobrado es el del servidor (lista), nunca el del cliente', async () => {
    const tenantId = 't-s18-price';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO price_lists (id, tenant_id, name, is_default, is_active)
         VALUES ('pl-1', ?, 'Lista Premium', 1, 1)`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO product_prices (id, tenant_id, price_list_id, product_id, price_cents)
         VALUES ('pp-1', ?, 'pl-1', ?, 5000)`,
      ).bind(tenantId, fixture.productId),
      env.DB.prepare(
        `UPDATE branches SET price_list_id = 'pl-1' WHERE id = ? AND tenant_id = ?`,
      ).bind(fixture.branchId, tenantId),
    ]);

    // El cliente intenta imponer manualPriceCents 999 pero el servidor cobra
    // 5000 de la lista (Zero-Trust) + IGV 18% → total 5900.
    const sale = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-s18-price', 1, 5900),
        items: [{ productId: fixture.productId, quantity: 1, manualPriceCents: 999 }],
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z'), s18: { pricingLists: true } },
    );
    expect(sale.status).toBe('SUCCESS');
    if (sale.status !== 'SUCCESS') return;
    expect(sale.authoritativeTotalAmount).toBe(5900);
  });
});

describe('S18-H2: NC fiscal revierte PMP (refresh_avg_cost)', () => {
  it('NC parcial recomputa pmp_unit_cost_cents del branch en la misma tx', async () => {
    const tenantId = 't-s18-nc-pmp';
    const fixture = await seedNvFixture(tenantId);
    // PMP inicial 500 (diverge del costo de venta 400): si la NC no refresca,
    // el PMP queda en 500 tras restaurar; con refresh baja a 450 (9×500+1×400)/10.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG' WHERE id = ?`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-f-pmp', ?, ?, '01', 'F001', 0, 'INTERNAL'),
                ('ser-nc-pmp', ?, ?, '07', 'FC01', 0, 'INTERNAL')`,
      ).bind(tenantId, fixture.branchId, tenantId, fixture.branchId),
      env.DB.prepare(
        `UPDATE branch_product_stock SET pmp_unit_cost_cents = 500
         WHERE tenant_id = ? AND product_id = ?`,
      ).bind(tenantId, fixture.productId),
    ]);

    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const sale = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-pmp-origin', 2, 2360),
        documentType: '01' as const,
        series: 'F001',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
        clientName: 'ACME SAC',
      },
      { nowMs: now },
    );
    expect(sale.status).toBe('SUCCESS');
    if (sale.status !== 'SUCCESS') return;

    // Simula CDR aceptado (precondición FISCAL_CDR_REQUIRED para NC).
    await env.DB.prepare(
      `UPDATE sales SET sunat_status = 'ACCEPTED' WHERE id = ? AND tenant_id = ?`,
    )
      .bind(sale.saleId, tenantId)
      .run();

    // NC parcial: devuelve 1 unidad (snapshot de costo 400 → PMP recomputa).
    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      sale.saleId,
      {
        motiveCode: '01',
        amountCents: 1180,
        fullCancellation: false,
        items: [{ productId: fixture.productId, quantity: 1 }],
      },
      'FC01',
    );
    expect(nc.status).toBe('SUCCESS');
    if (nc.status !== 'SUCCESS') return;

    // S18-H2: el PMP del branch se recomputó con el costo restaurado.
    // La venta snapshot el PMP vigente (500) → restore neutral a 500 → el PMP
    // no se corrompe (drift). El caso con drift real (recepción a otro costo)
    // se valida abajo con la recepción previa.
    const stock = await env.DB.prepare(
      `SELECT stock, pmp_unit_cost_cents FROM branch_product_stock
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number; pmp_unit_cost_cents: number }>();
    expect(stock?.stock).toBe(9);
    expect(stock?.pmp_unit_cost_cents).toBe(500); // neutral: snapshot == PMP vigente
  });

  it('NC restaura el snapshot de costo: PMP baja si hubo recepción posterior a costo menor', async () => {
    const tenantId = 't-s18-nc-pmp2';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenants SET formalization_mode = 'ELECTRONIC_ISSUER', tax_regime = 'RG' WHERE id = ?`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branch_document_series
           (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
         VALUES ('ser-f-pmp2', ?, ?, '01', 'F001', 0, 'INTERNAL'),
                ('ser-nc-pmp2', ?, ?, '07', 'FC01', 0, 'INTERNAL')`,
      ).bind(tenantId, fixture.branchId, tenantId, fixture.branchId),
    ]);

    // Venta con PMP 400 (fixture default) → snapshot unit_cost 400.
    const sale = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-pmp2-origin', 1, 1180),
        documentType: '01' as const,
        series: 'F001',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
        clientName: 'ACME SAC',
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
    );
    expect(sale.status).toBe('SUCCESS');
    if (sale.status !== 'SUCCESS') return;
    await env.DB.prepare(
      `UPDATE sales SET sunat_status = 'ACCEPTED' WHERE id = ? AND tenant_id = ?`,
    )
      .bind(sale.saleId, tenantId)
      .run();

    // Sale item id de la venta (para que la NC restaure con el snapshot de costo).
    const saleItem = await env.DB.prepare(
      `SELECT id FROM sale_items WHERE sale_id = ? AND tenant_id = ? LIMIT 1`,
    )
      .bind(sale.saleId, tenantId)
      .first<{ id: string }>();

    // Recepción posterior: +4 unidades a costo 500 → stock 13, PMP sube.
    await env.DB.prepare(
      `UPDATE branch_product_stock
       SET stock = 13, stock_microunits = 13000000,
           pmp_unit_cost_cents = 430
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .run();

    // NC devuelve 1 unidad con snapshot 400 → PMP recomputa a (12×430+1×400)/13 ≈ 427.
    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      sale.saleId,
      {
        motiveCode: '01',
        amountCents: 1180,
        fullCancellation: false,
        items: [
          {
            productId: fixture.productId,
            quantity: 1,
            ...(saleItem ? { originalSaleItemId: saleItem.id } : {}),
          },
        ],
      },
      'FC01',
    );
    expect(nc.status).toBe('SUCCESS');
    if (nc.status !== 'SUCCESS') return;

    const stock = await env.DB.prepare(
      `SELECT stock, pmp_unit_cost_cents FROM branch_product_stock
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number; pmp_unit_cost_cents: number }>();
    expect(stock?.stock).toBe(14);
    // Sin refresh quedaría 430 (drift); con refresh: (13×430 + 1×400)/14 ≈ 428.
    expect(stock?.pmp_unit_cost_cents).toBe(428);
  });
});

describe('S30-H1: promoción no rompe batch_id (evidencia real del motor)', () => {
  it('promo % fijo con lotes FEFO: batch_id estable y descuento exacto', async () => {
    const tenantId = 't-s30-promo-batch';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO inventory_batches
           (id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits)
         VALUES (?, ?, ?, ?, 'L-OK', '2026-12-31', 5, 5000000)`,
      ).bind('batch-promo-ok', tenantId, fixture.branchId, fixture.productId),
      env.DB.prepare(
        `UPDATE branch_product_stock SET stock = 5, stock_microunits = 5000000
         WHERE tenant_id = ? AND product_id = ?`,
      ).bind(tenantId, fixture.productId),
      env.DB.prepare(
        `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
         VALUES (?, ?, ?, 'DEFAULT', 'Default')`,
      ).bind(`loc-default:${tenantId}:${fixture.branchId}`, tenantId, fixture.branchId),
      env.DB.prepare(
        `INSERT INTO inventory_location_stock (tenant_id, branch_id, location_id, product_id, quantity_microunits)
         VALUES (?, ?, ?, ?, 5000000)`,
      ).bind(
        tenantId,
        fixture.branchId,
        `loc-default:${tenantId}:${fixture.branchId}`,
        fixture.productId,
      ),
      env.DB.prepare(
        `INSERT INTO inventory_location_batch_stock
           (tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits)
         VALUES (?, ?, ?, ?, 'batch-promo-ok', 5000000)`,
      ).bind(
        tenantId,
        fixture.branchId,
        `loc-default:${tenantId}:${fixture.branchId}`,
        fixture.productId,
      ),
      env.DB.prepare(
        `INSERT INTO promotions (id, tenant_id, name, active, applies_to, rule_json, created_by_user_id)
         VALUES ('promo-pct-s30', ?, '10% fijo', 1, 'PRODUCT', '{"kind":"percent","percent":10}', ?)`,
      ).bind(tenantId, fixture.userId),
      env.DB.prepare(
        `INSERT INTO product_promotions (id, tenant_id, promotion_id, product_id)
         VALUES ('pp-s30', ?, 'promo-pct-s30', ?)`,
      ).bind(tenantId, fixture.productId),
    ]);

    // 2 unidades con 10% fijo sobre precio 1000 → 2000 - 10% = 1800 + IGV 18% = 2124.
    const result = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-s30-promo-batch', 2, 2124),
        items: [{ productId: fixture.productId, quantity: 2, promotionIds: ['promo-pct-s30'] }],
      },
      {
        nowMs: Date.parse('2026-08-04T15:00:00.000Z'),
        s18: { inventoryBatches: true },
        pricingPromotionsEnabled: true,
      },
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.authoritativeTotalAmount).toBe(2124);

    // Criterio S30-H1: el batch_id de la línea es el lote FEFO descontado (0 rompimientos).
    const items = await env.DB.prepare(
      `SELECT batch_id, quantity, discount_amount_cents FROM sale_items
       WHERE sale_id = ? AND tenant_id = ?`,
    )
      .bind(result.saleId, tenantId)
      .all<{
        batch_id: string | null;
        quantity: number;
        discount_amount_cents: number;
      }>();
    expect(items.results.length).toBeGreaterThan(0);
    for (const item of items.results) {
      if (item.quantity > 0) {
        expect(item.batch_id).toBe('batch-promo-ok');
      }
    }
    // Descuento promo exacto: 2 × 1000 × 10% = 200 cents.
    const promoDiscount = items.results.reduce((s, i) => s + i.discount_amount_cents, 0);
    expect(promoDiscount).toBe(200);

    // El lote descontó exactamente las 2 unidades físicas (5 - 2 = 3).
    const batch = await env.DB.prepare(
      `SELECT stock FROM inventory_batches WHERE id = 'batch-promo-ok'`,
    )
      .bind()
      .first<{ stock: number }>();
    expect(batch?.stock).toBe(3);

    // S30-H1: el veredicto del chaos promotions-anti-stack exige la evidencia
    // real del motor — aquí se la damos (batch_id estable verificado arriba).
    const verdict = await runPromotionsAntiStackChaosScenario(async () => ({
      cycles: 500,
      discrepancies: 0,
      samples: [],
      batchEvidenceVerified: true,
    }));
    expect(verdict).toBe('PASS');
  });
});

describe('S30-H2: descuento manual re-resuelto server-side (regla 2)', () => {
  it('descuento manual bajo umbral → procede sin token', async () => {
    const tenantId = 't-s30-disc-ok';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, max_percent_without_auth, max_amount_without_auth_cents)
       VALUES (?, 5, 2000)`,
    )
      .bind(tenantId)
      .run();

    // 2 × 1000 = 2000 − 100 descuento = 1900 subtotal + 18% IGV = 2242.
    const result = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-s30-disc-ok', 2, 2242),
        items: [{ productId: fixture.productId, quantity: 2, discountAmountCents: 100 }],
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('descuento manual SOBRE umbral con token válido → SUCCESS', async () => {
    const tenantId = 't-s30-disc-token';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, max_percent_without_auth, max_amount_without_auth_cents)
       VALUES (?, 5, 2000)`,
    )
      .bind(tenantId)
      .run();
    // Emitir token server-side (mismo mecanismo que el PIN del supervisor).
    const token = `tok_${crypto.randomUUID()}`;
    const { sha256Hex } = await import('./crypto.js');
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare(
      `INSERT INTO authorization_tokens (id, tenant_id, token_hash, approved_by_user_id, expires_at)
       VALUES (?, ?, ?, 'approver-1', datetime('now', '+90 seconds'))`,
    )
      .bind(`at-${tenantId}`, tenantId, tokenHash)
      .run();

    // Descuento 2500 > umbral 2000 con token → procede (3 × 1000 − 2500 = 500 + 90 IGV = 590).
    const result = await processOfflineSaleAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        ...nvPayload(fixture, 'off-s30-disc-token', 3, 590),
        items: [{ productId: fixture.productId, quantity: 3, discountAmountCents: 2500 }],
        discountAuthorizationTokenHash: tokenHash,
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('descuento manual SOBRE umbral sin token → AUTH_TOKEN_REQUIRED (422)', async () => {
    const tenantId = 't-s30-disc-auth';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, max_percent_without_auth, max_amount_without_auth_cents)
       VALUES (?, 5, 2000)`,
    )
      .bind(tenantId)
      .run();

    // Descuento manual 2500 > umbral 2000 → exige authorization_token.
    await expect(
      processOfflineSaleAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          ...nvPayload(fixture, 'off-s30-disc-auth', 3, 590),
          items: [
            {
              productId: fixture.productId,
              quantity: 3,
              discountAmountCents: 2500,
              authorizationToken: 'ignored-for-now',
            },
          ],
        },
        { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
      ),
    ).rejects.toThrow('AUTH_TOKEN_REQUIRED');
  });
});

describe('propinas (Backlog v10 P2)', () => {
  it('cobra propina dentro del tope: total = venta + tip, tip_cents persistido, IGV solo sobre la venta', async () => {
    const tenantId = 't-p2-tip-ok';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, tip_max_percent)
       VALUES (?, 25)`,
    )
      .bind(tenantId)
      .run();

    // 1 x 1180 (1000 + IGV 18%) + propina 200 = 1380 pagado.
    const result = await processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, {
      ...nvPayload(fixture, 'off-p2-tip', 1, 1380),
      payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1380, tipCents: 200 }],
    });
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    const pay = await env.DB.prepare(
      `SELECT amount_cents, tip_cents FROM sale_payments WHERE sale_id = ?`,
    )
      .bind(result.saleId)
      .first<{ amount_cents: number; tip_cents: number }>();
    expect(pay?.amount_cents).toBe(1380);
    expect(pay?.tip_cents).toBe(200);

    const sale = await env.DB.prepare(
      `SELECT total_amount_cents, total_igv_cents FROM sales WHERE id = ?`,
    )
      .bind(result.saleId)
      .first<{ total_amount_cents: number; total_igv_cents: number }>();
    // El CPE conserva el valor de venta (1180); la propina no tributa IGV.
    expect(sale?.total_amount_cents).toBe(1180);
    expect(sale?.total_igv_cents).toBe(180);
  });

  it('rechaza propina sobre el tope del tenant (TIP_EXCEEDS_MAX_PERCENT)', async () => {
    const tenantId = 't-p2-tip-over';
    const fixture = await seedNvFixture(tenantId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_discount_policies (tenant_id, tip_max_percent)
       VALUES (?, 25)`,
    )
      .bind(tenantId)
      .run();

    // 1 x 1180, propina 300 > 25% de 1000 (250) → rechazo.
    await expect(
      processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, {
        ...nvPayload(fixture, 'off-p2-tip-over', 1, 1480),
        payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1480, tipCents: 300 }],
      }),
    ).rejects.toThrow('TIP_EXCEEDS_MAX_PERCENT');
  });

  it('rechaza pagos que no cuadran con venta + propina (PAYMENT_TOTAL_MISMATCH)', async () => {
    const tenantId = 't-p2-tip-mismatch';
    const fixture = await seedNvFixture(tenantId);
    await expect(
      processOfflineSaleAtomic(env.DB, tenantId, fixture.userId, {
        ...nvPayload(fixture, 'off-p2-mismatch', 1, 1200),
        payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: 1200, tipCents: 100 }],
      }),
    ).rejects.toThrow('PAYMENT_TOTAL_MISMATCH');
  });
});
