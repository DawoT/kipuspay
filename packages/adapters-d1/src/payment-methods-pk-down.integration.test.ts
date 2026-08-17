import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { DOWN_0051_SPRINT_M6_PAYMENT_METHODS_PK } from './migrations-down.js';

async function paymentMethodsPkColumns(): Promise<string[]> {
  const rows = await env.DB.prepare(`PRAGMA table_info(payment_methods)`).all<{
    name: string;
    pk: number;
  }>();
  return rows.results
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

describe('DOWN_0051 payment_methods PK (fail-closed)', () => {
  it('aborta si existen sale_payments y deja la PK compuesta intacta', async () => {
    expect(await paymentMethodsPkColumns()).toEqual(['tenant_id', 'id']);

    const tenantId = 't-pm-down-guard';
    const branchId = `b-${tenantId}`;
    const userId = `u-${tenantId}`;
    const sessionId = `s-${tenantId}`;
    const registerId = `cr-${tenantId}`;
    const saleId = `sale-${tenantId}`;
    const pmId = `pm-${tenantId}`;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Guard SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
      ).bind(branchId, tenantId),
      env.DB.prepare(
        `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
         VALUES (?, ?, ?, 'Caja 1')`,
      ).bind(registerId, tenantId, branchId),
      env.DB.prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, 'guard@example.com', 'owner')`,
      ).bind(userId, tenantId, branchId),
      env.DB.prepare(
        `INSERT INTO cash_register_sessions
           (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents)
         VALUES (?, ?, ?, ?, ?, 0)`,
      ).bind(sessionId, tenantId, branchId, registerId, userId),
      env.DB.prepare(
        `INSERT INTO payment_methods (id, tenant_id, code, name)
         VALUES (?, ?, 'CASH', 'Efectivo')`,
      ).bind(pmId, tenantId),
      env.DB.prepare(
        `INSERT INTO sales (
           id, tenant_id, branch_id, cash_register_session_id, user_id,
           client_document_type, client_document_number, client_name,
           document_type, series, number, total_amount_cents, issued_at_lima, sunat_status
         ) VALUES (?, ?, ?, ?, ?, '0', '-', 'ANONIMO',
                   'NV', 'NV01', 1, 100, CURRENT_TIMESTAMP, 'NOT_APPLICABLE')`,
      ).bind(saleId, tenantId, branchId, sessionId, userId),
      env.DB.prepare(
        `INSERT INTO sale_payments (id, tenant_id, sale_id, payment_method_id, amount_cents)
         VALUES (?, ?, ?, ?, 100)`,
      ).bind(`sp-${tenantId}`, tenantId, saleId, pmId),
    ]);

    await expect(env.DB.exec(DOWN_0051_SPRINT_M6_PAYMENT_METHODS_PK)).rejects.toThrow(
      /CHECK constraint failed|atomic_guards|ok = 1/i,
    );
    expect(await paymentMethodsPkColumns()).toEqual(['tenant_id', 'id']);
    const marker = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'sprint_m6.payment_methods_pk'`,
    ).first<{ value: string }>();
    expect(marker?.value).toBe('1');
  });
});
