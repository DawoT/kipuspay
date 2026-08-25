import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { RcCdrPort } from '@kipuspay/domain-fiscal-pe';
import { buildDailySummary, runDailySummarySweep } from './build-daily-summary.js';

async function seedRcTenant(
  tenantId: string,
  summaryDate = '2026-08-01',
  voidStatus = 'NONE',
): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
  saleId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const ruc = `20${String(Date.now()).slice(-9)}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime, ruc)
       VALUES (?, ?, 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'RG', ?)`,
    ).bind(tenantId, 'RC Async Test SAC', ruc),
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
    ).bind(`ser-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 1, 500,
                 ? || ' 12:00:00', '2026-08-08T23:59:59.999Z', ?, 'PENDING', 0, 0)`,
    ).bind(saleId, tenantId, branchId, sessionId, userId, summaryDate, voidStatus),
  ]);

  return { branchId, sessionId, userId, saleId };
}

describe('Fase 1 (Sprint 63) — Resiliencia de Tickets Asíncronos SUNAT (statusCode 98) y Correlativos', () => {
  it('1. Resumen que recibe ticket con statusCode 98 -> queda en PROCESSING con ticket guardado', async () => {
    const tenantId = `t-async-98-${Date.now()}`;
    const summaryDate = '2026-08-01';
    const { saleId } = await seedRcTenant(tenantId, summaryDate);

    const asyncPort: RcCdrPort = {
      submit: (_input) =>
        Promise.resolve({
          accepted: false,
          status: 'PROCESSING',
          ticket: 'SUNAT-TICKET-98765',
          cdrMessage: 'En proceso',
        }),
      queryStatus: (input) =>
        Promise.resolve({
          accepted: false,
          status: 'PROCESSING',
          ticket: input.ticket,
          cdrMessage: 'En proceso',
        }),
    };

    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      cdr: asyncPort,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.sunatStatus).toBe('PROCESSING');
    expect(result.sunatReceptionTicket).toBe('SUNAT-TICKET-98765');
    expect(result.rcUblId).toBe('RC-20260801-001');

    // Verificar en BD que sunat_daily_summaries tiene status PROCESSING y sunat_reception_ticket guardado
    const summaryRow = await env.DB.prepare(
      `SELECT status, sunat_reception_ticket, correlative, sunat_ticket FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(result.dailySummaryId)
      .first<{
        status: string;
        sunat_reception_ticket: string | null;
        correlative: number;
        sunat_ticket: string | null;
      }>();

    expect(summaryRow?.status).toBe('PROCESSING');
    expect(summaryRow?.sunat_reception_ticket).toBe('SUNAT-TICKET-98765');
    expect(summaryRow?.correlative).toBe(1);
    expect(summaryRow?.sunat_ticket).toBe('RC-20260801-001');

    // Verificar que la venta queda vinculada en PROCESSING (sin ser rechazada)
    const saleRow = await env.DB.prepare(
      `SELECT daily_summary_id, sunat_status FROM sales WHERE id = ?`,
    )
      .bind(saleId)
      .first<{ daily_summary_id: string | null; sunat_status: string }>();

    expect(saleRow?.daily_summary_id).toBe(result.dailySummaryId);
    expect(saleRow?.sunat_status).toBe('PROCESSING');
  });

  it('2. Sweep posterior consulta el ticket en PROCESSING y lo actualiza a ACCEPTED (incluyendo bajas)', async () => {
    const tenantId = `t-sweep-proc-${Date.now()}`;
    const summaryDate = '2026-08-05';
    const { saleId } = await seedRcTenant(tenantId, summaryDate, 'VOID_PENDING_RC');

    let queryCount = 0;
    const resolvingPort: RcCdrPort = {
      submit: (_input) =>
        Promise.resolve({
          accepted: false,
          status: 'PROCESSING',
          ticket: 'TICKET-TO-RESOLVE',
        }),
      queryStatus: (input) => {
        if (input.tenantId === tenantId) {
          queryCount += 1;
        }
        return Promise.resolve({
          accepted: true,
          status: 'ACCEPTED',
          cdrCode: '0',
          cdrMessage: 'El resumen fue aceptado',
          ticket: input.ticket,
        });
      },
    };

    // 1ª corrida: queda en PROCESSING
    const first = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      cdr: resolvingPort,
    });
    expect(first.sunatStatus).toBe('PROCESSING');

    // 2ª corrida vía runDailySummarySweep: descubre el tenant en PROCESSING y lo actualiza a ACCEPTED
    const sweep = await runDailySummarySweep(env.DB, {
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T14:00:00.000Z`),
      cdr: resolvingPort,
    });

    expect(queryCount).toBe(1);
    const tenantResult = sweep.results.find((r) => r.tenantId === tenantId);
    expect(tenantResult?.status).toBe('SUCCESS');

    // Verificar en BD que pasó a ACCEPTED
    const summaryRow = await env.DB.prepare(
      `SELECT status, cdr_code, cdr_message FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(first.dailySummaryId)
      .first<{ status: string; cdr_code: string | null; cdr_message: string | null }>();

    expect(summaryRow?.status).toBe('ACCEPTED');
    expect(summaryRow?.cdr_code).toBe('0');
    expect(summaryRow?.cdr_message).toBe('El resumen fue aceptado');

    // Venta pasa a ACCEPTED y baja pasa a VOIDED
    const saleRow = await env.DB.prepare(`SELECT sunat_status, void_status FROM sales WHERE id = ?`)
      .bind(saleId)
      .first<{ sunat_status: string; void_status: string }>();

    expect(saleRow?.sunat_status).toBe('ACCEPTED');
    expect(saleRow?.void_status).toBe('VOIDED');
  });

  it('3. Sweep posterior consulta ticket y procesa REJECTED si SUNAT rechaza el resumen', async () => {
    const tenantId = `t-sweep-rej-${Date.now()}`;
    const summaryDate = '2026-08-06';
    const { saleId } = await seedRcTenant(tenantId, summaryDate);

    const rejectingPort: RcCdrPort = {
      submit: (_input) =>
        Promise.resolve({
          accepted: false,
          status: 'PROCESSING',
          ticket: 'TICKET-REJECT',
        }),
      queryStatus: (input) =>
        Promise.resolve({
          accepted: false,
          status: 'REJECTED',
          cdrCode: '2335',
          cdrMessage: 'El comprobante fue informado previamente',
          ticket: input.ticket,
        }),
    };

    const first = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
      cdr: rejectingPort,
    });
    expect(first.sunatStatus).toBe('PROCESSING');

    const sweep = await runDailySummarySweep(env.DB, {
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T14:00:00.000Z`),
      cdr: rejectingPort,
    });

    const tenantResult = sweep.results.find((r) => r.tenantId === tenantId);
    expect(tenantResult?.status).toBe('SUCCESS');

    const summaryRow = await env.DB.prepare(
      `SELECT status, cdr_code, cdr_message FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(first.dailySummaryId)
      .first<{ status: string; cdr_code: string | null; cdr_message: string | null }>();

    expect(summaryRow?.status).toBe('REJECTED');
    expect(summaryRow?.cdr_code).toBe('2335');

    const saleRow = await env.DB.prepare(`SELECT sunat_status FROM sales WHERE id = ?`)
      .bind(saleId)
      .first<{ sunat_status: string }>();

    expect(saleRow?.sunat_status).toBe('REJECTED');
  });

  it('4. Unicidad de correlativos en (tenant_id, summary_date, correlative)', async () => {
    const tenantId = `t-corr-uniq-${Date.now()}`;
    const summaryDate = '2026-08-07';
    const seeded = await seedRcTenant(tenantId, summaryDate);

    // 1er resumen: correlative 1
    const first = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
    });
    expect(first.status).toBe('SUCCESS');
    expect(first.rcUblId).toBe('RC-20260807-001');

    const firstSummary = await env.DB.prepare(
      `SELECT correlative FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(first.dailySummaryId)
      .first<{ correlative: number }>();
    expect(firstSummary?.correlative).toBe(1);

    // Insertar segunda boleta para emitir COMPLEMENTARY
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente 2', '03', 'B001', 2, 800,
                 ? || ' 16:00:00', '2026-08-14T23:59:59.999Z', 'NONE', 'PENDING')`,
    )
      .bind(
        `sale-${tenantId}-2`,
        tenantId,
        seeded.branchId,
        seeded.sessionId,
        seeded.userId,
        summaryDate,
      )
      .run();

    // 2do resumen: correlative 2
    const second = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate,
      nowMs: Date.parse(`${summaryDate}T16:00:00.000Z`),
    });
    expect(second.status).toBe('SUCCESS');
    expect(second.rcType).toBe('COMPLEMENTARY');
    expect(second.rcUblId).toBe('RC-20260807-002');

    const secondSummary = await env.DB.prepare(
      `SELECT correlative FROM sunat_daily_summaries WHERE id = ?`,
    )
      .bind(second.dailySummaryId)
      .first<{ correlative: number }>();
    expect(secondSummary?.correlative).toBe(2);

    // Intento de insertar resumen con correlativo duplicado debe fallar por UNIQUE constraint
    await expect(
      env.DB.prepare(
        `INSERT INTO sunat_daily_summaries
           (id, tenant_id, summary_date, status, must_submit_by, rc_type, ticket_count,
            sunat_ticket, correlative)
         VALUES (?, ?, ?, 'ACCEPTED', datetime('now'), 'PRIMARY', 1, 'RC-20260807-001', 1)`,
      )
        .bind(`duplicate-summary-id-${Date.now()}`, tenantId, summaryDate)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed.*correlative/i);
  });
});
