import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { processDebitNoteAtomic } from './process-debit-note-atomic.js';

async function seedDebitFixture(tenantId: string): Promise<{
  branchId: string;
  saleId: string;
  seriesId: string;
  sessionId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const seriesId = `ser-8-${tenantId}`;
  const sessionId = `sess-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, 'ELECTRONIC_ISSUER')`,
    ).bind(tenantId, 'Debito SAC', 'retail', 'shard-1'),
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
       VALUES (?, ?, ?, '08', 'FC01', 40, 'INTERNAL')`,
    ).bind(seriesId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, exchange_rate,
         total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
         total_discount_cents, total_cogs_cents, total_amount_cents,
         sunat_status, issued_at_lima
       ) VALUES (?, ?, ?, ?, ?, '6', '20123456789', 'Empresa SAC',
         '01', 'F001', 12, 'PEN', 1.0, 100000, 0, 18000, 0, 0, 80000, 118000,
         'ACCEPTED', ?)`,
    ).bind(saleId, tenantId, branchId, sessionId, userId, '2026-08-12 10:00:00'),
  ]);

  return { branchId, saleId, seriesId, sessionId };
}

describe('processDebitNoteAtomic — integración D1 (P1a)', () => {
  it('emite ND real: correlativo +1, audit DEBIT_NOTE, must_submit_by y 0 stock', async () => {
    const tenantId = `t-dn-${Date.now()}`;
    const { branchId, saleId } = await seedDebitFixture(tenantId);

    const before = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser-8-${tenantId}`)
      .first<{ current_number: number }>();

    const beforeMs = Date.now();
    const res = await processDebitNoteAtomic(
      env.DB,
      tenantId,
      `u-${tenantId}`,
      saleId,
      { motiveCode: '02', amountCents: 5900, description: 'Aumento de valor' },
      'FC01',
    );
    expect(res.documentType).toBe('08');
    expect(res.number).toBe((before?.current_number ?? 40) + 1);

    const nd = await env.DB.prepare(
      `SELECT document_type, series, number, total_amount_cents, referenced_sale_id,
                credit_note_motive_code, sunat_status, must_submit_by
         FROM sales WHERE id = ?`,
    )
      .bind(res.debitNoteId)
      .first<{
        document_type: string;
        series: string;
        number: number;
        total_amount_cents: number;
        referenced_sale_id: string;
        credit_note_motive_code: string;
        sunat_status: string;
        must_submit_by: string | null;
      }>();
    expect(nd?.document_type).toBe('08');
    expect(nd?.referenced_sale_id).toBe(saleId);
    expect(nd?.credit_note_motive_code).toBe('02');
    expect(nd?.total_amount_cents).toBe(5900);
    expect(nd?.sunat_status).toBe('PENDING');
    expect(nd?.must_submit_by).not.toBeNull();
    // ND de factura: ventana de factura (3 días), no la de boleta (7).
    const windowDays = (Date.parse(nd!.must_submit_by!) - beforeMs) / 86400000;
    expect(windowDays).toBeGreaterThanOrEqual(2.9);
    expect(windowDays).toBeLessThan(3.1);

    const audit = await env.DB.prepare(
      `SELECT action, payload_json FROM audit_events WHERE tenant_id = ? AND action = 'DEBIT_NOTE' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string; payload_json: string }>();
    expect(audit?.action).toBe('DEBIT_NOTE');
    expect(JSON.parse(audit!.payload_json).amountCents).toBe(5900);

    const after = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser-8-${tenantId}`)
      .first<{ current_number: number }>();
    expect(after?.current_number).toBe((before?.current_number ?? 40) + 1);

    const stockRows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sale_items WHERE sale_id = ?`)
      .bind(res.debitNoteId)
      .first<{ n: number }>();
    expect(stockRows?.n).toBe(0);
  });

  it('rechaza ND sobre boleta sin CDR (FISCAL_CDR_REQUIRED) sin mover la serie', async () => {
    const tenantId = `t-dn-bad-${Date.now()}`;
    const { saleId } = await seedDebitFixture(tenantId);
    await env.DB.prepare(`UPDATE sales SET sunat_status = 'PENDING' WHERE id = ?`)
      .bind(saleId)
      .run();

    await expect(
      processDebitNoteAtomic(
        env.DB,
        tenantId,
        `u-${tenantId}`,
        saleId,
        {
          motiveCode: '01',
          amountCents: 100,
        },
        'FC01',
      ),
    ).rejects.toThrow('FISCAL_CDR_REQUIRED');

    const after = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser-8-${tenantId}`)
      .first<{ current_number: number }>();
    expect(after?.current_number).toBe(40);
  });
});
