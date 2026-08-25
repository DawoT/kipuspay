/**
 * H5 (auditoría 0031) — tope 10° día hábil del mes siguiente para NC E-A.
 *
 * La excepción E-A (NC de anulación sin CDR, origen REJECTED/QUARANTINED/
 * DEADLINE_EXCEEDED) solo procede dentro del tope SUNAT. Fuera del tope:
 * rechazo tipado CREDIT_NOTE_EA_DEADLINE_EXCEEDED y CERO escrituras parciales
 * (el guard corre en preflight, antes del plan atómico).
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { processCreditNoteAtomic } from './process-credit-note-atomic.js';

const ORIGIN_ISSUED_LIMA = '2026-08-03 10:00:00'; // lunes
// Tope: 14-sep-2026 23:59:59.999 Lima == 15-sep 04:59:59.999 UTC.
const WITHIN_MS = Date.parse('2026-09-10T15:00:00.000Z');
const PAST_MS = Date.parse('2026-09-20T15:00:00.000Z');

async function seedEaOrigin(tenantId: string): Promise<{
  originSaleId: string;
  userId: string;
  seriesId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const originSaleId = `bol-${tenantId}`;
  const seriesId = `ser07-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime)
       VALUES (?, ?, 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'RG')`,
    ).bind(tenantId, 'EA Deadline SAC'),
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
       VALUES (?, ?, ?, '07', 'FC01', 3, 'INTERNAL')`,
    ).bind(seriesId, tenantId, branchId),
    // Boleta origen REJECTED (E-A procede por estado) emitida 03-ago-2026.
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, exchange_rate,
         total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
         total_discount_cents, total_cogs_cents, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status,
         alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 1, 'PEN', 1.0,
                 1000, 0, 180, 0, 0, 0, 1180,
                 ?, '2026-08-10T23:59:59.999Z', 'NONE', 'REJECTED', 0, 0)`,
    ).bind(originSaleId, tenantId, branchId, sessionId, userId, ORIGIN_ISSUED_LIMA),
  ]);

  return { originSaleId, userId, seriesId };
}

describe('H5 — tope 10° día hábil del mes siguiente para NC E-A', () => {
  it('E-A dentro del tope → SUCCESS (regresión del camino feliz)', async () => {
    const tenantId = `t-ea-ok-${Date.now()}`;
    const seed = await seedEaOrigin(tenantId);
    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      seed.originSaleId,
      { motiveCode: '01', amountCents: 1180, fullCancellation: true, items: [] },
      'FC01',
      { nowMs: WITHIN_MS },
    );
    expect(nc.status).toBe('SUCCESS');
    expect(nc.requiresNoCdrAudit).toBe(true);
  });

  it('E-A después del tope → CREDIT_NOTE_EA_DEADLINE_EXCEEDED y rollback verificado', async () => {
    const tenantId = `t-ea-late-${Date.now()}`;
    const seed = await seedEaOrigin(tenantId);

    await expect(
      processCreditNoteAtomic(
        env.DB,
        tenantId,
        seed.userId,
        seed.originSaleId,
        { motiveCode: '01', amountCents: 1180, fullCancellation: true, items: [] },
        'FC01',
        { nowMs: PAST_MS },
      ),
    ).rejects.toThrow(/CREDIT_NOTE_EA_DEADLINE_EXCEEDED/);

    // Rollback verificado, no solo implementado: cero efectos parciales.
    const sales = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND document_type = '07'`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(sales?.n).toBe(0); // sin fila NC huérfana

    const series = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(seed.seriesId)
      .first<{ current_number: number }>();
    expect(series?.current_number).toBe(3); // correlativo intacto

    const audits = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(audits?.n).toBe(0); // sin auditoría huérfana

    const outbox = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM fiscal_outbox WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(outbox?.n).toBe(0); // sin cola fiscal huérfana
  });

  it('NC normal (origen ACCEPTED) NO pasa por el guard E-A aunque el origen sea viejo', async () => {
    // El tope es exclusivo de la anulación sin CDR; una NC con CDR del origen
    // ACCEPTED no tiene tope de días hábiles (viaja al RC/unitario normal).
    const tenantId = `t-ea-na-${Date.now()}`;
    const seed = await seedEaOrigin(tenantId);
    await env.DB.prepare(`UPDATE sales SET sunat_status = 'ACCEPTED' WHERE id = ?`)
      .bind(seed.originSaleId)
      .run();
    const nc = await processCreditNoteAtomic(
      env.DB,
      tenantId,
      seed.userId,
      seed.originSaleId,
      { motiveCode: '01', amountCents: 590, fullCancellation: false, items: [] },
      'FC01',
      { nowMs: PAST_MS },
    );
    expect(nc.status).toBe('SUCCESS');
    expect(nc.requiresNoCdrAudit).toBe(false);
  });
});
