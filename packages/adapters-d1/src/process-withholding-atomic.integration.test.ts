import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { processPerceptionAtomic, processRetentionAtomic } from './process-withholding-atomic.js';

async function seedWithholdingFixture(tenantId: string): Promise<{
  branchId: string;
  userId: string;
  saleId: string;
  supplierInvoiceId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const supplierInvoiceId = `si-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, 'ELECTRONIC_ISSUER')`,
    ).bind(tenantId, 'Retencion SAC', 'retail', 'shard-1'),
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
    ).bind(`sess-${tenantId}`, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, '02', 'P001', 10, 'INTERNAL')`,
    ).bind(`ser-p-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, '20', 'R001', 10, 'INTERNAL')`,
    ).bind(`ser-r-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, exchange_rate,
         total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
         total_discount_cents, total_cogs_cents, total_amount_cents,
         sunat_status, issued_at_lima
       ) VALUES (?, ?, ?, ?, ?, '6', '20123456789', 'Agente SAC',
         '01', 'F001', 12, 'PEN', 1.0, 100000, 0, 18000, 0, 0, 80000, 118000,
         'ACCEPTED', ?)`,
    ).bind(saleId, tenantId, branchId, `sess-${tenantId}`, userId, '2026-08-12 10:00:00'),
    env.DB.prepare(
      `INSERT INTO suppliers (id, tenant_id, ruc, business_name) VALUES (?, ?, '20111111111', 'Proveedor SAC')`,
    ).bind(`sup-${tenantId}`, tenantId),
    env.DB.prepare(
      `INSERT INTO purchase_orders (id, tenant_id, branch_id, supplier_id, status, total_amount_cents, created_by_user_id)
       VALUES (?, ?, ?, ?, 'DRAFT', 118000, ?)`,
    ).bind(`po-${tenantId}`, tenantId, branchId, `sup-${tenantId}`, userId),
    env.DB.prepare(
      `INSERT INTO supplier_invoices (id, tenant_id, branch_id, supplier_id, purchase_order_id, invoice_number, status, total_cents, igv_cents)
       VALUES (?, ?, ?, ?, ?, 'F001-0001', 'MATCHED', 118000, 18000)`,
    ).bind(supplierInvoiceId, tenantId, branchId, `sup-${tenantId}`, `po-${tenantId}`),
  ]);

  return { branchId, userId, saleId, supplierInvoiceId };
}

describe('processWithholdingAtomic — integración D1 (P1c)', () => {
  it('percepción real: 2% sobre venta, serie P +1, audit PERCEPTION', async () => {
    const tenantId = `t-perc-${Date.now()}`;
    const { branchId, userId, saleId } = await seedWithholdingFixture(tenantId);

    const res = await processPerceptionAtomic(
      env.DB,
      tenantId,
      branchId,
      userId,
      saleId,
      'P001',
      10_000,
      'goods',
    );
    expect(res.amountCents).toBe(200);
    expect(res.number).toBe(11);

    const row = await env.DB.prepare(
      `SELECT series, number, base_amount_cents, rate_percentage, amount_cents, sunat_status FROM perceptions WHERE id = ?`,
    )
      .bind(res.perceptionId)
      .first<{
        series: string;
        number: number;
        base_amount_cents: number;
        rate_percentage: number;
        amount_cents: number;
        sunat_status: string;
      }>();
    expect(row?.series).toBe('P001');
    expect(row?.number).toBe(11);
    expect(row?.base_amount_cents).toBe(10_000);
    expect(row?.rate_percentage).toBe(200);
    expect(row?.amount_cents).toBe(200);
    expect(row?.sunat_status).toBe('PENDING');

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events WHERE tenant_id = ? AND action = 'PERCEPTION' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string }>();
    expect(audit?.action).toBe('PERCEPTION');
  });

  it('retención real: 6% servicios sobre factura de proveedor, serie R +1', async () => {
    const tenantId = `t-ret-${Date.now()}`;
    const { branchId, userId, supplierInvoiceId } = await seedWithholdingFixture(tenantId);

    const res = await processRetentionAtomic(
      env.DB,
      tenantId,
      branchId,
      userId,
      supplierInvoiceId,
      'R001',
      10_000,
      'services',
    );
    expect(res.amountCents).toBe(600);
    expect(res.number).toBe(11);

    const row = await env.DB.prepare(
      `SELECT series, number, rate_percentage, amount_cents FROM retentions WHERE id = ?`,
    )
      .bind(res.retentionId)
      .first<{ series: string; number: number; rate_percentage: number; amount_cents: number }>();
    expect(row?.series).toBe('R001');
    expect(row?.rate_percentage).toBe(600);
    expect(row?.amount_cents).toBe(600);

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events WHERE tenant_id = ? AND action = 'RETENTION' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string }>();
    expect(audit?.action).toBe('RETENTION');
  });

  it('rechaza venta inexistente sin mover la serie', async () => {
    const tenantId = `t-perc-bad-${Date.now()}`;
    const { branchId, userId } = await seedWithholdingFixture(tenantId);

    await expect(
      processPerceptionAtomic(env.DB, tenantId, branchId, userId, 'sale-x', 'P001', 100, 'goods'),
    ).rejects.toThrow('ORIGIN_SALE_NOT_FOUND');

    const series = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser-p-${tenantId}`)
      .first<{ current_number: number }>();
    expect(series?.current_number).toBe(10);
  });
});
