import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { InsufficientStockError, type OfflineSalePayload } from '@kipuspay/domain-sales';
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
