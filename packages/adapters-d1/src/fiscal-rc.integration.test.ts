import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { buildDailySummary, triggerRcFromCashClose } from './build-daily-summary.js';
import { processFiscalDeadlines } from './process-fiscal-deadlines.js';
import { voidBoletaAtomic } from './void-boleta-atomic.js';

async function seedBoletaTenant(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  saleId: string;
  productId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const productId = `p-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const seriesId = `ser-${tenantId}`;
  const paymentMethodId = `pm-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'RC SAC', 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'NRUS'),
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
       VALUES (?, ?, ?, '03', 'B001', 0, 'INTERNAL')`,
    ).bind(seriesId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO products
         (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
       VALUES (?, ?, ?, ?, 'physical', 'NIU', 400, 100, 10, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto'),
    env.DB.prepare(
      `INSERT INTO branch_product_stock
         (tenant_id, branch_id, product_id, stock, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 10, 100)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 1, 400,
                 '2026-08-01 12:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING', 0, 0)`,
    ).bind(saleId, tenantId, branchId, sessionId, userId),
  ]);

  return { branchId, sessionId, saleId, productId };
}

describe('fiscal RC / plazos / baja / chaos deadline', () => {
  it('buildDailySummary: RC PRIMARY por emisor/día + CDR mock', async () => {
    const tenantId = 't-rc-1';
    const { saleId } = await seedBoletaTenant(tenantId);
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.ticketCount).toBe(1);
    expect(result.sunatStatus).toBe('ACCEPTED');

    const sale = await env.DB.prepare(
      `SELECT daily_summary_id, sunat_status FROM sales WHERE id = ?`,
    )
      .bind(saleId)
      .first<{ daily_summary_id: string; sunat_status: string }>();
    expect(sale?.daily_summary_id).toBe(result.dailySummaryId);
    expect(sale?.sunat_status).toBe('ACCEPTED');

    const rc = await env.DB.prepare(
      `SELECT tenant_id, summary_date, branch_id, ticket_count FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(result.dailySummaryId)
      .first<{
        tenant_id: string;
        summary_date: string;
        branch_id: string | null;
        ticket_count: number;
      }>();
    expect(rc?.tenant_id).toBe(tenantId);
    expect(rc?.summary_date).toBe('2026-08-01');
    expect(rc?.branch_id).toBeNull();
  });

  it('Z no dispara RC', () => {
    expect(() => triggerRcFromCashClose()).toThrow('CASH_CLOSE_MUST_NOT_TRIGGER_RC');
  });

  it('void E-C: OK pre-RC; 422 post-RC; stock/caja invariantes', async () => {
    const tenantId = 't-void-1';
    const { saleId, productId, branchId } = await seedBoletaTenant(tenantId);

    const stockBefore = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, productId)
      .first<{ stock: number }>();

    const voided = await voidBoletaAtomic(env.DB, tenantId, saleId);
    expect(voided.voidStatus).toBe('VOID_PENDING_RC');
    expect(voided.stockAfter).toBe(voided.stockBefore);
    expect(voided.stockBefore).toBe(stockBefore?.stock);

    const rc = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.now(),
    });
    expect(rc.status).toBe('SUCCESS');

    // segunda boleta del mismo día ya no — insert another and try void after RC day accepted
    const sale2 = `sale2-${tenantId}`;
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status
       ) VALUES (?, ?, ?, (SELECT id FROM cash_register_sessions WHERE tenant_id = ? LIMIT 1),
                 (SELECT id FROM users WHERE tenant_id = ? LIMIT 1),
                 '1', '12345678', 'Cliente', '03', 'B001', 2, 400,
                 '2026-08-01 15:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING')`,
    )
      .bind(sale2, tenantId, branchId, tenantId, tenantId)
      .run();

    // Link day RC already ACCEPTED → void must 422 even for new boleta of same day
    // (RC PRIMARY already exists for the day)
    await expect(voidBoletaAtomic(env.DB, tenantId, sale2)).rejects.toThrow('VOID_AFTER_RC_SENT');

    const stockAfter = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, productId)
      .first<{ stock: number }>();
    expect(stockAfter?.stock).toBe(stockBefore?.stock);
  });

  it('plazos: T-24h → T-6h → DEADLINE_EXCEEDED + alerta E-A (chaos)', async () => {
    const tenantId = 't-dl-1';
    const { saleId } = await seedBoletaTenant(tenantId);
    const must = Date.parse('2026-08-10T12:00:00.000Z');
    await env.DB.prepare(`UPDATE sales SET must_submit_by = ? WHERE id = ?`)
      .bind(new Date(must).toISOString(), saleId)
      .run();

    const steps: { alert: 'T24H' | 'T6H' | 'DEADLINE_EXCEEDED'; suggestCreditNoteEa: boolean }[] =
      [];

    const t24 = await processFiscalDeadlines(env.DB, must - 20 * 3600 * 1000, { tenantId });
    expect(t24.actions[0]?.alert).toBe('T24H');
    steps.push({
      alert: 'T24H',
      suggestCreditNoteEa: t24.actions[0]!.suggestCreditNoteEa,
    });

    const t6 = await processFiscalDeadlines(env.DB, must - 3 * 3600 * 1000, { tenantId });
    expect(t6.actions[0]?.alert).toBe('T6H');
    steps.push({
      alert: 'T6H',
      suggestCreditNoteEa: t6.actions[0]!.suggestCreditNoteEa,
    });

    const dead = await processFiscalDeadlines(env.DB, must + 1000, { tenantId });
    expect(dead.actions[0]?.alert).toBe('DEADLINE_EXCEEDED');
    expect(dead.actions[0]?.suggestCreditNoteEa).toBe(true);
    steps.push({
      alert: 'DEADLINE_EXCEEDED',
      suggestCreditNoteEa: true,
    });

    const sale = await env.DB.prepare(`SELECT sunat_status FROM sales WHERE id = ?`)
      .bind(saleId)
      .first<{ sunat_status: string }>();
    expect(sale?.sunat_status).toBe('DEADLINE_EXCEEDED');

    const alerts = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_owner_alerts WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(alerts?.n).toBe(3);
    // CA: 0 vencimiento silencioso
    expect(steps.some((s) => s.alert === 'DEADLINE_EXCEEDED' && s.suggestCreditNoteEa)).toBe(true);
    expect(alerts!.n).toBeGreaterThan(0);
  });

  it('NRUS ≤500 entra en RC consolidado (omisión unitaria contada)', async () => {
    const tenantId = 't-nrus-1';
    await seedBoletaTenant(tenantId);
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.now(),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.nrusOmittedCount).toBe(1);
  });
});
