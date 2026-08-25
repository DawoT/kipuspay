import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { buildDailySummary } from './build-daily-summary.js';

async function seedRcTenantWithNSales(
  tenantId: string,
  summaryDate: string,
  n: number,
): Promise<void> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const ruc = `20${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 10)}`;
  // Use env.DB directly via batch
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime, ruc)
       VALUES (?, ?, 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'RG', ?)`,
    ).bind(tenantId, `RC Chaos ${tenantId}`, ruc),
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
  ]);
  for (let i = 1; i <= n; i += 1) {
    const saleId = `sale-${tenantId}-${i}`;
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', ?, 500,
                 ? || ' 12:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING', 0, 0)`,
    )
      .bind(saleId, tenantId, branchId, sessionId, userId, i, summaryDate)
      .run();
  }
}

/**
 * Risco 3 — chaos concurrent-writers para RC correlative crash-safe.
 * Fix 0482 usa MAX+1 + retry 3: correcto para 2 writers pero agota bajo
 * 10+ concurrentes → 500 UNIQUE correlative. Este chaos valida que con
 * bump a retry 10 (build-daily-summary.ts maxAttempts=10) los 10 writers
 * concurrentes terminan con correlative único 1..N sin 500.
 *
 * Ver: packages/adapters-d1/src/build-daily-summary.ts (Risco 3, maxAttempts)
 * y docs/auditor F-02 para ventana residual no serializable.
 */
describe('Risco 3 — RC chaos concurrent-writers N=10 correlative único sin 500', () => {
  it('10 buildDailySummary concurrentes mismo tenant/date → correlatives 1..N únicos, cero 500', async () => {
    const tenantId = `t-rc-chaos-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const summaryDate = '2026-08-03';
    const N = 10;
    await seedRcTenantWithNSales(tenantId, summaryDate, N);

    const results = await Promise.all(
      Array.from({ length: N }, () =>
        buildDailySummary(env.DB, {
          tenantId,
          summaryDate,
          nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
        }),
      ),
    );

    // Ninguno debe haber lanzado; todos SUCCESS o ALREADY_EXISTS, jamás throw 500
    for (const r of results) {
      expect(['SUCCESS', 'ALREADY_EXISTS', 'NOOP_EMPTY']).toContain(r.status);
    }

    const correlatives = await env.DB.prepare(
      `SELECT correlative, sunat_ticket, ticket_count FROM sunat_daily_summaries WHERE tenant_id = ? AND summary_date = ? ORDER BY correlative ASC`,
    )
      .bind(tenantId, summaryDate)
      .all<{ correlative: number; sunat_ticket: string; ticket_count: number }>();

    const rows = correlatives.results ?? [];
    // Debe haber al menos 1 RC y a lo sumo N, con correlatives contiguos 1..k y únicos
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(N);
    const corrs = rows.map((r) => r.correlative);
    const unique = new Set(corrs);
    expect(unique.size).toBe(corrs.length);
    // Contiguos 1..k
    const sorted = [...corrs].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      expect(sorted[i]).toBe(i + 1);
    }
    // sunat_ticket debe ser RC-YYYYMMDD-NNN correspondiente
    for (const r of rows) {
      expect(r.sunat_ticket).toBe(`RC-20260803-${String(r.correlative).padStart(3, '0')}`);
    }
    // Todas las ventas deben quedar vinculadas a algún RC (ninguna huérfana PENDING sin daily_summary_id)
    const sales = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM sales WHERE tenant_id = ? AND daily_summary_id IS NULL AND date(issued_at_lima)=?`,
    )
      .bind(tenantId, summaryDate)
      .first<{ n: number }>();
    expect(sales?.n).toBe(0);

    // Correlativos únicos 1..N sin huecos si hubo N RCs; si hubo menos, igual contiguos
    // Para el caso de alta contención con N=10 ventas, esperamos al menos 2 RCs debido a la carrera
    // (F-05b ya valida 2 → 1,2). Con maxAttempts=10 la ventana serializa sin 500.
    // Si solo hubo 1 RC, es aceptable cuando la carrera no dividió tickets, pero no debe haber 500.
  });

  it('10 writers sin datos previos no dan 500 (NOOP/ALREADY_EXISTS)', async () => {
    const tenantId = `t-rc-chaos-empty-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const summaryDate = '2026-08-04';
    await seedRcTenantWithNSales(tenantId, summaryDate, 0);
    // Sin boletas, los 10 concurrentes deben retornar NOOP_EMPTY o ALREADY_EXISTS sin throw
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        buildDailySummary(env.DB, {
          tenantId,
          summaryDate,
          nowMs: Date.parse(`${summaryDate}T12:00:00.000Z`),
        }),
      ),
    );
    for (const r of results) {
      expect(['NOOP_EMPTY', 'ALREADY_EXISTS', 'SUCCESS']).toContain(r.status);
    }
  });
});
