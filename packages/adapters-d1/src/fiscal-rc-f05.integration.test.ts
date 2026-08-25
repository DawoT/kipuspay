import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { RcCdrPort } from '@kipuspay/domain-fiscal-pe';
import { buildDailySummary, runDailySummarySweep } from './build-daily-summary.js';

async function seedRcTenant(
  tenantId: string,
  summaryDate = '2026-08-01',
): Promise<{ branchId: string; sessionId: string; userId: string; saleId: string }> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const ruc = `20${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 10)}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime, ruc)
       VALUES (?, ?, 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'RG', ?)`,
    ).bind(tenantId, 'RC F05 Test SAC', ruc),
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
      `INSERT INTO cash_register_sessions (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, '03', 'B001', 0, 'INTERNAL')`,
    ).bind(`ser-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 1, 500,
                 ? || ' 12:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING', 0, 0)`,
    ).bind(saleId, tenantId, branchId, sessionId, userId, summaryDate),
  ]);
  return { branchId, sessionId, userId, saleId };
}

describe('F-05 — Auditoría RC gaps', () => {
  it('F-05a: crash entre submit y UPDATE deja PROCESSING huérfano sin ticket, siguiente build recupera sin pérdida', async () => {
    const tenantId = `t-f05a-${Date.now()}`;
    const summaryDate = '2026-08-01';
    const { saleId, branchId, sessionId, userId } = await seedRcTenant(tenantId, summaryDate);

    // Simular crash: insertamos manualmente un RC en PROCESSING con ticket NULL y venta vinculada
    // como lo haría el INSERT optimista antes de submit
    const orphanId = `orphan-${tenantId}`;
    const sunatTicket = 'RC-20260801-001';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO sunat_daily_summaries (id, tenant_id, branch_id, summary_date, status, must_submit_by, rc_type, ticket_count, sunat_ticket, sunat_reception_ticket, correlative, cdr_code, cdr_message, submitted_at)
         VALUES (?, ?, NULL, ?, 'PROCESSING', datetime('now', '+6 days'), 'PRIMARY', 1, ?, NULL, 1, NULL, NULL, datetime('now'))`,
      ).bind(orphanId, tenantId, summaryDate, sunatTicket),
      env.DB.prepare(
        `UPDATE sales SET daily_summary_id = ?, sunat_status = 'PROCESSING' WHERE id = ?`,
      ).bind(orphanId, saleId),
    ]);

    // Verificar huérfano existe sin ticket
    const before = await env.DB.prepare(
      `SELECT sunat_reception_ticket, status FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(orphanId)
      .first<{ sunat_reception_ticket: string | null; status: string }>();
    expect(before?.sunat_reception_ticket).toBeNull();
    expect(before?.status).toBe('PROCESSING');

    // Siguiente build debe detectar huérfano sin ticket y reusarlo, haciendo submit idempotente
    const recoveringPort: RcCdrPort = {
      submit: (inp) => {
        // Debe reusar mismo summaryId/correlative
        expect(inp.summaryId).toBe(orphanId);
        expect(inp.ublId).toBe(sunatTicket);
        return Promise.resolve({
          accepted: true,
          status: 'ACCEPTED',
          ticket: 'SUNAT-TICKET-98765',
          cdrCode: '0',
          cdrMessage: 'Aceptado',
        });
      },
      queryStatus: (inp) =>
        Promise.resolve({
          accepted: true,
          status: 'ACCEPTED',
          cdrCode: '0',
          cdrMessage: 'Aceptado',
          ticket: inp.ticket,
        }),
    };

    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      cdr: recoveringPort,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.dailySummaryId).toBe(orphanId);
    expect(result.sunatReceptionTicket).toBe('SUNAT-TICKET-98765');
    expect(result.sunatStatus).toBe('ACCEPTED');

    const after = await env.DB.prepare(
      `SELECT sunat_reception_ticket, status, cdr_code FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(orphanId)
      .first<{ sunat_reception_ticket: string | null; status: string; cdr_code: string | null }>();
    expect(after?.sunat_reception_ticket).toBe('SUNAT-TICKET-98765');
    expect(after?.status).toBe('ACCEPTED');
    expect(after?.cdr_code).toBe('0');

    const saleAfter = await env.DB.prepare(
      `SELECT sunat_status, daily_summary_id FROM sales WHERE id = ?`,
    )
      .bind(saleId)
      .first<{ sunat_status: string; daily_summary_id: string | null }>();
    expect(saleAfter?.sunat_status).toBe('ACCEPTED');
    expect(saleAfter?.daily_summary_id).toBe(orphanId);
  });

  it('F-05a: simulacro kill mitad de submit (mock que resuelve ticket pero INSERT final nunca corre) — siguiente build recupera', async () => {
    const tenantId = `t-f05a-kill-${Date.now()}`;
    const summaryDate = '2026-08-02';
    const { saleId } = await seedRcTenant(tenantId, summaryDate);

    // Mock que simula que submit resuelve ticket pero el proceso muere antes del UPDATE final
    // En nuestro nuevo flujo, el INSERT optimista ya dejó fila PROCESSING sin ticket
    // Simulamos eso insertando huérfano como si el submit hubiera retornado ticket pero el UPDATE no corrió
    const orphanId2 = `orphan2-${tenantId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO sunat_daily_summaries (id, tenant_id, branch_id, summary_date, status, must_submit_by, rc_type, ticket_count, sunat_ticket, sunat_reception_ticket, correlative, cdr_code, cdr_message, submitted_at)
         VALUES (?, ?, NULL, ?, 'PROCESSING', datetime('now', '+6 days'), 'PRIMARY', 1, 'RC-20260802-001', NULL, 1, NULL, NULL, datetime('now'))`,
      ).bind(orphanId2, tenantId, summaryDate),
      env.DB.prepare(
        `UPDATE sales SET daily_summary_id = ?, sunat_status = 'PROCESSING' WHERE id = ?`,
      ).bind(orphanId2, saleId),
    ]);

    // Aunque SUNAT ya tiene el ticket SUNAT-TICKET-98765, D1 aún no lo tiene (NULL)
    // El siguiente build debe recuperar el ticket vía resubmit idempotente
    let submitCallCount = 0;
    const port: RcCdrPort = {
      submit: () => {
        submitCallCount += 1;
        return Promise.resolve({
          accepted: false,
          status: 'PROCESSING',
          ticket: 'SUNAT-TICKET-98765',
          cdrMessage: 'En proceso',
        });
      },
      queryStatus: async (inp) => {
        // Si alguna vez se consulta por ticket, devolver processing
        return {
          accepted: false,
          status: 'PROCESSING',
          ticket: inp.ticket,
          cdrMessage: 'En proceso',
        };
      },
    };

    const recovered = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      cdr: port,
    });

    // Debe haber hecho resubmit y ahora tener ticket guardado, aunque sigue PROCESSING
    expect(submitCallCount).toBe(1);
    expect(recovered.status).toBe('SUCCESS');
    expect(recovered.sunatReceptionTicket).toBe('SUNAT-TICKET-98765');
    expect(recovered.sunatStatus).toBe('PROCESSING');

    const row = await env.DB.prepare(
      `SELECT sunat_reception_ticket, status FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(orphanId2)
      .first<{ sunat_reception_ticket: string | null; status: string }>();
    expect(row?.sunat_reception_ticket).toBe('SUNAT-TICKET-98765');
    expect(row?.status).toBe('PROCESSING');
  });

  it('F-05b: 2 buildDailySummary concurrentes mismo tenant/date → correlatives 1 y 2 sin 500', async () => {
    const tenantId = `t-f05b-${Date.now()}`;
    const summaryDate = '2026-08-03';
    const { branchId, sessionId, userId } = await seedRcTenant(tenantId, summaryDate);
    // Segunda boleta para que haya material para complementary si hace falta, pero el test
    // de concurrencia con una sola boleta también debe dar 1 y 2 sin 500 (aunque duplique venta,
    // lo importante es no 500)
    // Insertamos segunda boleta adicional para que haya 2 pendientes
    await env.DB.prepare(
      `INSERT INTO sales (id, tenant_id, branch_id, cash_register_session_id, user_id, client_document_type, client_document_number, client_name, document_type, series, number, total_amount_cents, issued_at_lima, must_submit_by, void_status, sunat_status)
       VALUES (?, ?, ?, ?, ?, '1', '87654321', 'Cliente2', '03', 'B001', 2, 600, ? || ' 13:00:00', '2026-08-10T23:59:59.999Z', 'NONE', 'PENDING')`,
    )
      .bind(`sale2-${tenantId}`, tenantId, branchId, sessionId, userId, summaryDate)
      .run();

    const results = await Promise.all([
      buildDailySummary(env.DB, {
        tenantId,
        summaryDate,
        nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      }),
      buildDailySummary(env.DB, {
        tenantId,
        summaryDate,
        nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      }),
    ]);

    expect(results[0]?.status).toBe('SUCCESS');
    expect(results[1]?.status).toBe('SUCCESS');
    const correlatives = await env.DB.prepare(
      `SELECT correlative, sunat_ticket FROM sunat_daily_summaries WHERE tenant_id = ? AND summary_date = ? ORDER BY correlative ASC`,
    )
      .bind(tenantId, summaryDate)
      .all<{ correlative: number; sunat_ticket: string }>();
    const corrs = (correlatives.results ?? []).map((r) => r.correlative);
    expect(corrs).toEqual([1, 2]);
    const tickets = (correlatives.results ?? []).map((r) => r.sunat_ticket);
    expect(tickets).toEqual(['RC-20260803-001', 'RC-20260803-002']);
  });

  it('F-05c: sweep resuelve todos los PROCESSING del mismo día (sin LIMIT 1)', async () => {
    const tenantId = `t-f05c-${Date.now()}`;
    const summaryDate = '2026-08-04';
    const { branchId, sessionId, userId } = await seedRcTenant(tenantId, summaryDate);
    // Crear segunda boleta para segundo RC
    await env.DB.prepare(
      `INSERT INTO sales (id, tenant_id, branch_id, cash_register_session_id, user_id, client_document_type, client_document_number, client_name, document_type, series, number, total_amount_cents, issued_at_lima, must_submit_by, void_status, sunat_status)
       VALUES (?, ?, ?, ?, ?, '1', '11111111', 'Cliente2', '03', 'B001', 2, 700, ? || ' 14:00:00', '2026-08-11T23:59:59.999Z', 'NONE', 'PENDING')`,
    )
      .bind(`sale2-${tenantId}`, tenantId, branchId, sessionId, userId, summaryDate)
      .run();

    // Forzar 2 RC en PROCESSING manualmente
    const id1 = `rc1-${tenantId}`;
    const id2 = `rc2-${tenantId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO sunat_daily_summaries (id, tenant_id, branch_id, summary_date, status, must_submit_by, rc_type, ticket_count, sunat_ticket, sunat_reception_ticket, correlative)
         VALUES (?, ?, NULL, ?, 'PROCESSING', datetime('now', '+6 days'), 'PRIMARY', 1, 'RC-20260804-001', 'TICKET-1', 1)`,
      ).bind(id1, tenantId, summaryDate),
      env.DB.prepare(
        `INSERT INTO sunat_daily_summaries (id, tenant_id, branch_id, summary_date, status, must_submit_by, rc_type, ticket_count, sunat_ticket, sunat_reception_ticket, correlative)
         VALUES (?, ?, NULL, ?, 'PROCESSING', datetime('now', '+6 days'), 'COMPLEMENTARY', 1, 'RC-20260804-002', 'TICKET-2', 2)`,
      ).bind(id2, tenantId, summaryDate),
      env.DB.prepare(
        `UPDATE sales SET daily_summary_id = ?, sunat_status='PROCESSING' WHERE id = ?`,
      ).bind(id1, `sale-${tenantId}`),
      env.DB.prepare(
        `UPDATE sales SET daily_summary_id = ?, sunat_status='PROCESSING' WHERE id = ?`,
      ).bind(id2, `sale2-${tenantId}`),
    ]);

    const resolvingPort: RcCdrPort = {
      submit: () =>
        Promise.resolve({ accepted: true, status: 'ACCEPTED', cdrCode: '0', cdrMessage: 'ok' }),
      queryStatus: (inp) =>
        Promise.resolve({
          accepted: true,
          status: 'ACCEPTED',
          cdrCode: '0',
          cdrMessage: 'Aceptado',
          ticket: inp.ticket,
        }),
    };

    const sweep = await runDailySummarySweep(env.DB, {
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T15:00:00.000Z`),
      cdr: resolvingPort,
    });

    // Ambos deben quedar ACCEPTED en un solo sweep
    const rows = await env.DB.prepare(
      `SELECT id, status FROM sunat_daily_summaries WHERE tenant_id = ? AND summary_date = ? ORDER BY correlative ASC`,
    )
      .bind(tenantId, summaryDate)
      .all<{ id: string; status: string }>();
    expect(rows.results?.length).toBe(2);
    expect(rows.results?.every((r) => r.status === 'ACCEPTED')).toBe(true);
    // Sweep debe haber encontrado al tenant
    expect(sweep.results.find((r) => r.tenantId === tenantId)).toBeDefined();
  });
});
