/**
 * H1 (auditoría 0031) — NC/ND sobre boletas viajan por el Resumen Diario (RC).
 *
 * Regla SUNAT §5.2: las notas (07/08) que ajustan boletas ('03') NO viajan
 * como XML unitario. Se encolan al fiscal_outbox con canal RC; el drain las
 * reclama y libera (SKIP_RC → PENDING); el cron del RC las entrega dentro del
 * sobre SummaryDocuments (buildDailySummary → CDR). Las notas sobre FACTURAS
 * siguen UNIT_XML (regresión cubierta aquí y en fiscal-drain.test.ts).
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { assertValidSummaryDocumentsXml } from '@kipuspay/domain-fiscal-pe';
import { buildDailySummary, runDailySummarySweep } from './build-daily-summary.js';
import { processCreditNoteAtomic } from './process-credit-note-atomic.js';
import { processDebitNoteAtomic } from './process-debit-note-atomic.js';

/** Fecha Lima (UTC-5) al momento de la prueba — los procesos atómicos sellan new Date(). */
function limaToday(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function seedNoteTenant(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  // RUC único por tenant (UNIQUE en tenants.ruc); 11 dígitos válidos.
  const ruc = `20${String(Date.now()).slice(-9)}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime, ruc)
       VALUES (?, ?, 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'RG', ?)`,
    ).bind(tenantId, 'Notas SAC', ruc),
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
       VALUES (?, ?, ?, '03', 'B001', 1, 'INTERNAL'),
              (?, ?, ?, '07', 'FC01', 0, 'INTERNAL'),
              (?, ?, ?, '08', 'BC01', 0, 'INTERNAL')`,
    ).bind(
      `ser03-${tenantId}`,
      tenantId,
      branchId,
      `ser07-${tenantId}`,
      tenantId,
      branchId,
      `ser08-${tenantId}`,
      tenantId,
      branchId,
    ),
  ]);

  return { branchId, sessionId, userId };
}

async function seedBoleta(input: {
  readonly tenantId: string;
  readonly branchId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly saleId: string;
  readonly totalCents: number;
  readonly sunatStatus: string;
  /** RC histórico ya cubierto (el sweep no debe re-descubrir por la boleta). */
  readonly dailySummaryId?: string;
}): Promise<void> {
  const total = input.totalCents;
  await env.DB.prepare(
    `INSERT INTO sales (
       id, tenant_id, branch_id, cash_register_session_id, user_id,
       client_document_type, client_document_number, client_name,
       document_type, series, number, currency, exchange_rate,
       total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
       total_discount_cents, total_cogs_cents, total_amount_cents,
       issued_at_lima, must_submit_by, void_status, sunat_status,
       alert_t24_sent, alert_t6_sent, daily_summary_id
     ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 1, 'PEN', 1.0,
               ?, 0, ?, 0, 0, 0, ?, ?, ?, ?, ?, 0, 0, ?)`,
  )
    .bind(
      input.saleId,
      input.tenantId,
      input.branchId,
      input.sessionId,
      input.userId,
      Math.round(total / 1.18),
      total - Math.round(total / 1.18),
      total,
      `${limaToday()} 10:00:00`,
      new Date(Date.now() + 7 * 86400000).toISOString(),
      'NONE',
      input.sunatStatus,
      input.dailySummaryId ?? null,
    )
    .run();
}

describe('H1 — NC/ND sobre boletas viajan por el Resumen Diario (RC)', () => {
  it('H1-a: NC sobre boleta ACCEPTED se encola al outbox (canal RC → PENDING)', async () => {
    const tenantId = `t-h1-nc-${Date.now()}`;
    const seed = await seedNoteTenant(tenantId);
    const boletaId = `bol-${tenantId}`;
    await seedBoleta({
      tenantId,
      branchId: seed.branchId,
      sessionId: seed.sessionId,
      userId: seed.userId,
      saleId: boletaId,
      totalCents: 118000,
      sunatStatus: 'ACCEPTED',
    });

    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      boletaId,
      {
        motiveCode: '01',
        amountCents: 118000,
        fullCancellation: true,
        items: [],
      },
      'FC01',
    );
    expect(nc.status).toBe('SUCCESS');

    // H1: la fila DEBE existir — hoy el hueco la omite y la NC muere en PENDING.
    const outbox = await env.DB.prepare(
      `SELECT status, must_submit_by FROM fiscal_outbox WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind(tenantId, nc.creditNoteSaleId)
      .first<{ status: string; must_submit_by: string | null }>();
    expect(outbox?.status).toBe('PENDING');
    expect(outbox?.must_submit_by).not.toBeNull();
  });

  it('H1-b: ND sobre boleta ACCEPTED se encola al outbox (canal RC → PENDING)', async () => {
    const tenantId = `t-h1-nd-${Date.now()}`;
    const seed = await seedNoteTenant(tenantId);
    const boletaId = `bol-${tenantId}`;
    await seedBoleta({
      tenantId,
      branchId: seed.branchId,
      sessionId: seed.sessionId,
      userId: seed.userId,
      saleId: boletaId,
      totalCents: 118000,
      sunatStatus: 'ACCEPTED',
    });

    const nd = await processDebitNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      boletaId,
      { motiveCode: '02', amountCents: 5900 },
      'BC01',
    );

    const outbox = await env.DB.prepare(
      `SELECT status, must_submit_by FROM fiscal_outbox WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind(tenantId, nd.debitNoteId)
      .first<{ status: string; must_submit_by: string | null }>();
    expect(outbox?.status).toBe('PENDING');
    expect(outbox?.must_submit_by).not.toBeNull();
  });

  it('H1-c/e: el RC incluye líneas 07/08 de notas sobre boletas y pasa la validación UBL', async () => {
    const tenantId = `t-h1-rc-${Date.now()}`;
    const seed = await seedNoteTenant(tenantId);
    const day = limaToday();
    const boletaId = `bol-${tenantId}`;

    // Día D: boleta PENDING → RC PRIMARY la acepta.
    await seedBoleta({
      tenantId,
      branchId: seed.branchId,
      sessionId: seed.sessionId,
      userId: seed.userId,
      saleId: boletaId,
      totalCents: 118000,
      sunatStatus: 'PENDING',
    });
    const primary = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: day,
      nowMs: Date.now(),
    });
    expect(primary.status).toBe('SUCCESS');
    expect(primary.rcType).toBe('PRIMARY');

    // Mismo día D: NC de anulación + ND de ajuste sobre la boleta ya aceptada.
    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      boletaId,
      {
        motiveCode: '01',
        amountCents: 118000,
        fullCancellation: true,
        items: [],
      },
      'FC01',
    );
    const nd = await processDebitNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      boletaId,
      { motiveCode: '02', amountCents: 5900 },
      'BC01',
    );
    // Los procesos atómicos sellan new Date(): fijamos issued_at_lima al día D
    // para que ambas notas caigan en el RC complementario del mismo día.
    await env.DB.batch([
      env.DB.prepare(`UPDATE sales SET issued_at_lima = ? WHERE id = ?`).bind(
        `${day} 23:00:00`,
        nc.creditNoteSaleId,
      ),
      env.DB.prepare(`UPDATE sales SET issued_at_lima = ? WHERE id = ?`).bind(
        `${day} 23:30:00`,
        nd.debitNoteId,
      ),
    ]);

    let submittedXml = '';
    const comp = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: day,
      nowMs: Date.now(),
      cdr: {
        submit: (input) => {
          submittedXml = input.xml;
          return Promise.resolve({ accepted: true, cdrCode: '0', cdrMessage: 'ok' });
        },
      },
    });
    expect(comp.status).toBe('SUCCESS');
    expect(comp.rcType).toBe('COMPLEMENTARY');
    expect(comp.ticketCount).toBe(2);

    // (e) El sobre mixto (07+08) pasa la validación de estructura existente.
    expect(submittedXml).toContain('<SummaryDocuments');
    expect(() => assertValidSummaryDocumentsXml(submittedXml)).not.toThrow();
    // Líneas con tipo real y serie/número de cada nota.
    expect(submittedXml).toContain('<cbc:DocumentTypeCode>07</cbc:DocumentTypeCode>');
    expect(submittedXml).toContain('<cbc:DocumentTypeCode>08</cbc:DocumentTypeCode>');
    expect(submittedXml).toContain('<cbc:ID>FC01-00000001</cbc:ID>');
    expect(submittedXml).toContain('<cbc:ID>BC01-00000001</cbc:ID>');
    // Motivo visible vía catálogo 19: NC anulación → baja (3); ND → adición (1).
    expect(submittedXml).toContain('<cbc:ConditionCode>3</cbc:ConditionCode>');
    expect(submittedXml).toContain('<cbc:ConditionCode>1</cbc:ConditionCode>');

    // Ambas notas quedan cubiertas por el resumen — jamás DEADLINE_EXCEEDED.
    const notes = await env.DB.prepare(
      `SELECT sunat_status, daily_summary_id FROM sales WHERE id IN (?, ?)`,
    )
      .bind(nc.creditNoteSaleId, nd.debitNoteId)
      .all<{ sunat_status: string; daily_summary_id: string | null }>();
    expect(notes.results).toHaveLength(2);
    for (const note of notes.results ?? []) {
      expect(note.sunat_status).toBe('ACCEPTED');
      expect(note.daily_summary_id).toBe(comp.dailySummaryId);
    }

    // Idempotente: tercera corrida NO re-emite ni re-lista.
    const again = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: day,
      nowMs: Date.now(),
    });
    expect(again.status).toBe('ALREADY_EXISTS');
  });

  it('H1: el sweep descubre tenants cuya única deuda fiscal es una nota sobre boleta', async () => {
    const tenantId = `t-h1-sweep-${Date.now()}`;
    const seed = await seedNoteTenant(tenantId);
    const boletaId = `bol-${tenantId}`;
    // Boleta con su RC histórico ya asignado: el único pendiente real es la NC.
    await seedBoleta({
      tenantId,
      branchId: seed.branchId,
      sessionId: seed.sessionId,
      userId: seed.userId,
      saleId: boletaId,
      totalCents: 118000,
      sunatStatus: 'ACCEPTED',
      dailySummaryId: `sum-hist-${tenantId}`,
    });

    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      boletaId,
      {
        motiveCode: '01',
        amountCents: 118000,
        fullCancellation: true,
        items: [],
      },
      'FC01',
    );
    // Los procesos atómicos sellan issued_at_lima en UTC: fijamos la fecha Lima
    // del documento para que el barrido del día la encuentre.
    await env.DB.prepare(`UPDATE sales SET issued_at_lima = ? WHERE id = ?`)
      .bind(`${limaToday()} 23:00:00`, nc.creditNoteSaleId)
      .run();

    const sweep = await runDailySummarySweep(env.DB, {
      summaryDate: limaToday(),
      nowMs: Date.now(),
    });
    const ours = sweep.results.filter((r) => r.tenantId === tenantId);
    expect(ours).toHaveLength(1);
    expect(ours[0]?.status).toBe('SUCCESS');

    const ncRow = await env.DB.prepare(`SELECT sunat_status FROM sales WHERE id = ?`)
      .bind(nc.creditNoteSaleId)
      .first<{ sunat_status: string }>();
    expect(ncRow?.sunat_status).toBe('ACCEPTED');
  });

  it('H1-d regresión: NC/ND sobre FACTURA siguen canal UNIT_XML (fila outbox PENDING)', async () => {
    const tenantId = `t-h1-fact-${Date.now()}`;
    const seed = await seedNoteTenant(tenantId);
    const facturaId = `fac-${tenantId}`;
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, exchange_rate,
         total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
         total_discount_cents, total_cogs_cents, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status
       ) VALUES (?, ?, ?, ?, ?, '6', '20123456789', 'Empresa SAC', '01', 'F001', 12, 'PEN', 1.0,
                 100000, 0, 18000, 0, 0, 0, 118000, ?, ?, 'NONE', 'ACCEPTED')`,
    )
      .bind(
        facturaId,
        tenantId,
        seed.branchId,
        seed.sessionId,
        seed.userId,
        `${limaToday()} 09:00:00`,
        new Date(Date.now() + 3 * 86400000).toISOString(),
      )
      .run();

    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      facturaId,
      {
        motiveCode: '02',
        amountCents: 11800,
        fullCancellation: false,
        items: [],
      },
      'FC01',
    );
    const nd = await processDebitNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      facturaId,
      { motiveCode: '02', amountCents: 5900 },
      'BC01',
    );

    const rows = await env.DB.prepare(
      `SELECT sale_id, status FROM fiscal_outbox WHERE tenant_id = ? AND sale_id IN (?, ?)`,
    )
      .bind(tenantId, nc.creditNoteSaleId, nd.debitNoteId)
      .all<{ sale_id: string; status: string }>();
    expect(rows.results).toHaveLength(2);
    for (const row of rows.results ?? []) {
      expect(row.status).toBe('PENDING');
    }
  });

  it('H1 caos: NC duplicada contra residual consumido se rechaza — 0 filas outbox extra', async () => {
    const tenantId = `t-h1-dup-${Date.now()}`;
    const seed = await seedNoteTenant(tenantId);
    const boletaId = `bol-${tenantId}`;
    await seedBoleta({
      tenantId,
      branchId: seed.branchId,
      sessionId: seed.sessionId,
      userId: seed.userId,
      saleId: boletaId,
      totalCents: 118000,
      sunatStatus: 'ACCEPTED',
    });

    const first = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      boletaId,
      {
        motiveCode: '01',
        amountCents: 118000,
        fullCancellation: true,
        items: [],
      },
      'FC01',
    );
    expect(first.status).toBe('SUCCESS');

    // Reintento duplicado (offline replay): el residual ya fue consumido por
    // la 1ª NC → la 2ª jamás persiste ni encola (cero duplicación).
    await expect(
      processCreditNoteAtomic(
        env.DB,
        tenantId,
        seed.userId,
        boletaId,
        {
          motiveCode: '01',
          amountCents: 1,
          fullCancellation: true,
          items: [],
        },
        'FC01',
      ),
    ).rejects.toThrow('NC_EXCEEDS_RESIDUAL');

    const outboxCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_outbox WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(outboxCount?.n).toBe(1);

    const seriesRow = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser07-${tenantId}`)
      .first<{ current_number: number }>();
    expect(seriesRow?.current_number).toBe(1); // la serie no se movió de más
  });
});
