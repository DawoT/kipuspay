import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { issueSelfSignedX509, signCpeXml } from '@kipuspay/domain-fiscal-pe';
import {
  buildDailySummary,
  runDailySummarySweep,
  triggerRcFromCashClose,
} from './build-daily-summary.js';
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
         (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 10, 10000000, 100)`,
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

  it('COMPLEMENTARY RC cuando PRIMARY existe y entra una boleta nueva', async () => {
    const tenantId = 't-rc-comp-1';
    const seeded = await seedBoletaTenant(tenantId);
    const first = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
    });
    expect(first.status).toBe('SUCCESS');
    expect(first.rcType).toBe('PRIMARY');
    expect(first.rcUblId).toBe('RC-20260801-001');

    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 2, 400,
                 '2026-08-01 13:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING', 0, 0)`,
    )
      .bind(`sale-${tenantId}-2`, tenantId, seeded.branchId, seeded.sessionId, `u-${tenantId}`)
      .run();

    const second = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
    });
    expect(second.status).toBe('SUCCESS');
    expect(second.rcType).toBe('COMPLEMENTARY');
    expect(second.rcUblId).toBe('RC-20260801-002');
  });

  it('TENANT_CERT sin signer → MISSING_SIGNER (fail-closed)', async () => {
    const tenantId = 't-rc-sign-1';
    await seedBoletaTenant(tenantId);
    await env.DB.prepare(`UPDATE tenants SET pse_mode = 'TENANT_CERT' WHERE id = ?`)
      .bind(tenantId)
      .run();
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.now(),
    });
    expect(result.status).toBe('MISSING_SIGNER');
  });

  it('TENANT_CERT con signer → SUCCESS y SummaryDocuments firmado', async () => {
    const tenantId = 't-rc-sign-ok';
    await seedBoletaTenant(tenantId);
    await env.DB.prepare(
      `UPDATE tenants SET pse_mode = 'TENANT_CERT', ruc = '20612913251', business_name = 'Rosa Negra' WHERE id = ?`,
    )
      .bind(tenantId)
      .run();
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const certDer = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'RC Fixture',
      organization: 'KipusPay Test',
      country: 'PE',
    });
    let submittedXml = '';
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
      signer: {
        sign: (xml) =>
          signCpeXml(xml, {
            privateKeyPkcs8Der: pkcs8,
            certDer,
            signingTime: '2026-08-21T16:00:00.000Z',
          }),
      },
      cdr: {
        submit(input) {
          submittedXml = input.xml;
          return Promise.resolve({
            accepted: true,
            cdrCode: '0',
            cdrMessage: 'Mock RC CDR accepted',
          });
        },
      },
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.rcUblId).toBe('RC-20260801-001');
    expect(submittedXml).toContain('<SummaryDocuments');
    expect(submittedXml).toContain('<ds:Signature');
    expect(submittedXml).toContain('<xades:QualifyingProperties');
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

    // S17-H3: la baja genera audit_events VOID con hash encadenado.
    const audit = await env.DB.prepare(
      `SELECT action, entity_id, row_hash, prev_hash FROM audit_events
       WHERE tenant_id = ? AND action = 'VOID' ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string; entity_id: string; row_hash: string; prev_hash: string | null }>();
    expect(audit?.action).toBe('VOID');
    expect(audit?.entity_id).toBe(saleId);
    expect(audit?.row_hash).toMatch(/^[a-f0-9]{64}$/);
    // Primera entrada de la cadena del tenant: prev_hash null; luego encadena.
    expect(audit?.prev_hash).toBeNull();

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
    // F5b-3: fila en cola fiscal — DEADLINE_EXCEEDED debe marcarla FAILED.
    await env.DB.prepare(
      `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, must_submit_by)
       VALUES (?, ?, ?, 'PENDING', ?)`,
    )
      .bind(`outbox-${saleId}`, tenantId, saleId, new Date(must).toISOString())
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

    // F5b-3: la fila de la cola fiscal queda FAILED con last_error DEADLINE_EXCEEDED.
    const outbox = await env.DB.prepare(`SELECT status, last_error FROM fiscal_outbox WHERE id = ?`)
      .bind(`outbox-${saleId}`)
      .first<{ status: string; last_error: string | null }>();
    expect(outbox?.status).toBe('FAILED');
    expect(outbox?.last_error).toBe('DEADLINE_EXCEEDED');

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

  it('F5b-4: 2ª corrida NO re-emite alertas (dedup flags) — 0 vencimiento silencioso', async () => {
    const tenantId = 't-dl-dup';
    const { saleId } = await seedBoletaTenant(tenantId);
    const must = Date.parse('2026-08-10T12:00:00.000Z');
    await env.DB.prepare(`UPDATE sales SET must_submit_by = ? WHERE id = ?`)
      .bind(new Date(must).toISOString(), saleId)
      .run();

    const t24a = await processFiscalDeadlines(env.DB, must - 20 * 3600 * 1000, { tenantId });
    expect(t24a.actions[0]?.alert).toBe('T24H');
    const alertsAfterFirst = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_owner_alerts WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(alertsAfterFirst?.n).toBe(1);

    // Segunda corrida en la misma ventana: flag alert_t24_sent=1 → sin acción.
    const t24b = await processFiscalDeadlines(env.DB, must - 19 * 3600 * 1000, { tenantId });
    expect(t24b.actions).toEqual([]);
    const alertsAfterSecond = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_owner_alerts WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(alertsAfterSecond?.n).toBe(1);
  });

  it('F5b-4: sweep multi-tenant sin tenantId barre todos y respeta límite', async () => {
    const now = Date.parse('2026-08-10T12:00:00.000Z');
    const t1 = 't-mt-1';
    const t2 = 't-mt-2';
    const { saleId: s1 } = await seedBoletaTenant(t1);
    const { saleId: s2 } = await seedBoletaTenant(t2);
    // Ambas en ventana T24H (deadline +23h / +22h: dentro de T24, fuera de T6),
    // con deadlines distintos para orden determinista (ORDER BY must_submit_by ASC).
    // s1 (deadline +22h, más próxima) se procesa primero con limit=1.
    await env.DB.prepare(`UPDATE sales SET must_submit_by = ? WHERE id = ?`)
      .bind(new Date(now + 22 * 3600 * 1000).toISOString(), s1)
      .run();
    await env.DB.prepare(`UPDATE sales SET must_submit_by = ? WHERE id = ?`)
      .bind(new Date(now + 23 * 3600 * 1000).toISOString(), s2)
      .run();

    // Límite 1 con scope por tenant: solo la venta más próxima (s1) se procesa.
    const limited = await processFiscalDeadlines(env.DB, now, { tenantId: t1, limit: 1 });
    expect(limited.scanned).toBe(1);
    expect(limited.actions.length).toBe(1);
    expect(limited.actions[0]?.alert).toBe('T24H');

    // Sweep global sin tenantId: s2 recibe su T24H y s1 (ya alertada) NO se re-emite.
    const full = await processFiscalDeadlines(env.DB, now, { limit: 100 });
    const fullForOurTenants = full.actions.filter((a) => a.saleId === s1 || a.saleId === s2);
    expect(fullForOurTenants.length).toBe(1);
    expect(fullForOurTenants[0]?.saleId).toBe(s2);

    // Invariante del criterio: exactamente 1 alerta por venta, 0 silencios.
    const perSale = await env.DB.prepare(
      `SELECT sale_id, COUNT(*) AS n FROM fiscal_owner_alerts
       WHERE tenant_id IN (?, ?) GROUP BY sale_id ORDER BY sale_id`,
    )
      .bind(t1, t2)
      .all<{ sale_id: string; n: number }>();
    expect(perSale.results).toHaveLength(2);
    expect(perSale.results.every((r) => r.n === 1)).toBe(true);
  });

  it('F5b-1: sweep multi-tenant construye RC de TODOS los tenants con boletas del día', async () => {
    const t1 = 't-sweep-1';
    const t2 = 't-sweep-2';
    await seedBoletaTenant(t1);
    await seedBoletaTenant(t2);
    const nowMs = Date.parse('2026-08-02T12:00:00.000Z');

    const sweep = await runDailySummarySweep(env.DB, {
      summaryDate: '2026-08-01',
      nowMs,
    });

    // El sweep es global: al menos incluye a nuestros 2 tenants.
    const ours = sweep.results.filter((r) => r.tenantId === t1 || r.tenantId === t2);
    expect(ours).toHaveLength(2);
    expect(ours.every((r) => r.status === 'SUCCESS')).toBe(true);
    expect(sweep.tenantsWithPending).toBeGreaterThanOrEqual(2);

    // Cada RC existe por emisor/día (branch_id NULL — FIS-03).
    const summaries = await env.DB.prepare(
      `SELECT tenant_id, branch_id, rc_type, status FROM sunat_daily_summaries
       WHERE summary_date = '2026-08-01' AND tenant_id IN (?, ?) ORDER BY tenant_id`,
    )
      .bind(t1, t2)
      .all<{ tenant_id: string; branch_id: string | null; rc_type: string; status: string }>();
    expect(summaries.results).toHaveLength(2);
    expect(summaries.results.every((s) => s.rc_type === 'PRIMARY')).toBe(true);
    expect(summaries.results.every((s) => s.branch_id === null)).toBe(true);

    // Segunda corrida: ALREADY_EXISTS (idempotente), 0 duplicados.
    const again = await runDailySummarySweep(env.DB, {
      summaryDate: '2026-08-01',
      nowMs,
    });
    const oursAgain = again.results.filter((r) => r.tenantId === t1 || r.tenantId === t2);
    expect(oursAgain).toEqual([]); // ya RC construido → ya no están "pending"
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

  it('COMPLEMENTARY no re-lista boletas ACCEPTED huérfanas (S6)', async () => {
    const tenantId = 't-rc-comp-s6';
    const first = await seedBoletaTenant(tenantId);
    const primary = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
    });
    expect(primary.status).toBe('SUCCESS');

    const orphan = `${first.saleId}-orphan`;
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, daily_summary_id
       ) VALUES (?, ?, ?, ?, 'u1', '1', '12345678', 'A', '03', 'B001', 9, 500,
                 '2026-08-01 16:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'ACCEPTED', NULL)`,
    )
      .bind(orphan, tenantId, first.branchId, first.sessionId)
      .run();

    const late = `${first.saleId}-late`;
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status
       ) VALUES (?, ?, ?, ?, 'u1', '1', '12345678', 'A', '03', 'B001', 10, 500,
                 '2026-08-01 18:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING')`,
    )
      .bind(late, tenantId, first.branchId, first.sessionId)
      .run();

    const complementary = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T18:00:00.000Z'),
    });
    expect(complementary.status).toBe('SUCCESS');
    expect(complementary.ticketCount).toBe(1);

    const orphanRow = await env.DB.prepare(`SELECT daily_summary_id FROM sales WHERE id = ?`)
      .bind(orphan)
      .first<{ daily_summary_id: string | null }>();
    expect(orphanRow?.daily_summary_id).toBeNull();

    const lateRow = await env.DB.prepare(`SELECT daily_summary_id FROM sales WHERE id = ?`)
      .bind(late)
      .first<{ daily_summary_id: string | null }>();
    expect(lateRow?.daily_summary_id).toBe(complementary.dailySummaryId);
  });
});
