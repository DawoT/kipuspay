import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { ALREADY_ERASED, ANONYMIZED_DOCUMENT, ANONYMIZED_NAME } from '@kipuspay/domain-customers';
import {
  eraseCustomer,
  exportCustomer,
  getCustomer,
  listConsents,
  listCustomers,
  writeConsent,
} from './customer-repository.js';

const NOW = '2026-08-10T12:00:00.000Z';

function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function seedTenant(tenantId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type) VALUES (?, ?, 'retail')`,
    ).bind(tenantId, `Tenant ${tenantId}`),
  ]);
}

async function seedSaleContext(tenantId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'B1', 'Principal', 'Lima')`,
    ).bind(`b-${tenantId}`, tenantId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'supervisor')`,
    ).bind(`u-${tenantId}`, tenantId, `b-${tenantId}`, `${tenantId}@example.test`),
    env.DB.prepare(
      `INSERT OR IGNORE INTO cash_registers (id, tenant_id, branch_id, name)
       VALUES (?, ?, ?, 'Caja 1')`,
    ).bind(`cr-${tenantId}`, tenantId, `b-${tenantId}`),
    env.DB.prepare(
      `INSERT OR IGNORE INTO cash_register_sessions (id, tenant_id, branch_id, cash_register_id, user_id, status)
       VALUES (?, ?, ?, ?, ?, 'OPEN')`,
    ).bind(`cs-${tenantId}`, tenantId, `b-${tenantId}`, `cr-${tenantId}`, `u-${tenantId}`),
  ]);
}

async function seedSale(
  tenantId: string,
  saleId: string,
  customerId: string,
  clientName: string,
  docNumber: string,
  number = 1,
): Promise<void> {
  await seedSaleContext(tenantId);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
         client_document_type, client_document_number, client_name, document_type,
         series, number, total_amount_cents, issued_at_lima
       ) VALUES (?, ?, ?, ?, ?, ?, '1', ?, ?, '01', 'F001', ?, 11800, ?)`,
    ).bind(
      saleId,
      tenantId,
      `b-${tenantId}`,
      `cs-${tenantId}`,
      `u-${tenantId}`,
      customerId,
      docNumber,
      clientName,
      number,
      NOW,
    ),
  ]);
}

async function seedCustomer(
  tenantId: string,
  customerId: string,
  docNumber: string,
  name: string,
  email: string,
): Promise<void> {
  await seedTenant(tenantId);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO customers (
         id, tenant_id, document_type_code, document_number, name, email, phone, address,
         credit_limit_cents, profile_updated_at, is_active
       ) VALUES (?, ?, '1', ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, 1)`,
    ).bind(customerId, tenantId, docNumber, name, email, '999111222', 'Jr. Lima 123'),
  ]);
}

describe('customer-repository LPDP (Sprint 47)', () => {
  it('inventario PII aislado por tenant del JWT (LPDP-04)', async () => {
    const t = uniqueId('t');
    await seedCustomer(t, uniqueId('c'), '12345678', 'Ana Pérez', 'ana@a.com');
    await seedCustomer(uniqueId('t'), uniqueId('c'), '87654321', 'Otro', 'otro@b.com');
    const inventory = await listCustomers(env.DB, t);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({ documentNumber: '12345678', name: 'Ana Pérez' });
  });

  it('registra y revoca consentimiento por propósito (LPDP-01)', async () => {
    const t = uniqueId('t');
    const c = uniqueId('c');
    await seedCustomer(t, c, '11112222', 'Carlos', 'carlos@c.com');
    const granted = await writeConsent(env.DB, t, c, 'marketing', true, NOW);
    expect(granted.kind).toBe('GRANT');
    const consents = await listConsents(env.DB, t, c);
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({ purpose: 'marketing', granted: true });

    const revoke = await writeConsent(env.DB, t, c, 'marketing', false, NOW);
    expect(revoke.kind).toBe('REVOKE');
    const after = await listConsents(env.DB, t, c);
    expect(after[0]).toMatchObject({ purpose: 'marketing', granted: false, revokedAtIso: NOW });

    const noop = await writeConsent(env.DB, t, c, 'marketing', false, NOW);
    expect(noop.kind).toBe('NOOP');
  });

  it('export por-cliente incluye perfil, consentimientos y ventas del titular (LPDP-02)', async () => {
    const t = uniqueId('t');
    const c = uniqueId('c');
    await seedCustomer(t, c, '12121212', 'Mía', 'mia@m.com');
    const saleId = uniqueId('s');
    await seedSale(t, saleId, c, 'Mía Torres', '12121212');
    await writeConsent(env.DB, t, c, 'messaging_whatsapp', true, NOW);

    const payload = await exportCustomer(env.DB, t, c);
    expect(payload.customerId).toBe(c);
    expect(payload.profile).toMatchObject({
      documentNumber: '12121212',
      name: 'Mía',
      email: 'mia@m.com',
    });
    expect(payload.consents).toHaveLength(1);
    expect(payload.consents[0]).toMatchObject({ purpose: 'messaging_whatsapp', granted: true });
    expect(payload.sales).toHaveLength(1);
    expect(payload.sales[0]).toMatchObject({ saleId, documentType: '01', series: 'F001' });

    await expect(exportCustomer(env.DB, uniqueId('t'), c)).rejects.toThrow('CUSTOMER_NOT_FOUND');
  });

  it('export rechaza cliente ya anonimizado (LPDP-02/03 fail-closed)', async () => {
    const t = uniqueId('t');
    const c = uniqueId('c');
    await seedCustomer(t, c, '34343434', 'Noa', 'noa@n.com');
    await eraseCustomer(env.DB, {
      tenantId: t,
      branchId: uniqueId('b'),
      actorUserId: uniqueId('u'),
      customerId: c,
      nowIso: NOW,
    });
    await expect(exportCustomer(env.DB, t, c)).rejects.toThrow('CUSTOMER_ERASED');
  });

  it('erase anonimiza perfil y snapshot fiscal sin tocar otros tenants (LPDP-03)', async () => {
    const t = uniqueId('t');
    const c = uniqueId('c');
    const saleId1 = uniqueId('s');
    await seedCustomer(t, c, '33334444', 'Diana', 'diana@d.com');
    await seedSale(t, saleId1, c, 'Diana Pérez', '33334444');
    await seedSale(t, uniqueId('s'), c, ANONYMIZED_NAME, ANONYMIZED_DOCUMENT, 2);
    await writeConsent(env.DB, t, c, 'marketing', true, NOW);

    const result = await eraseCustomer(env.DB, {
      tenantId: t,
      branchId: uniqueId('b'),
      actorUserId: uniqueId('u'),
      customerId: c,
      nowIso: NOW,
    });
    expect(result.fiscalSnapshotsAnonymized).toBe(1);
    expect(result.consentsRevoked).toBe(1);

    const customer = await getCustomer(env.DB, t, c);
    expect(customer).toMatchObject({ pii_erased: 1, name: null, email: null });

    const saleRow = await env.DB.prepare(
      `SELECT client_name, client_document_number FROM sales WHERE tenant_id = ? AND id = ?`,
    )
      .bind(t, saleId1)
      .first<{ client_name: string; client_document_number: string }>();
    expect(saleRow).toEqual({
      client_name: ANONYMIZED_NAME,
      client_document_number: ANONYMIZED_DOCUMENT,
    });
  });

  it('erase es idempotente fail-closed: ALREADY_ERASED en fila ya anonimizada', async () => {
    const t = uniqueId('t');
    const c = uniqueId('c');
    await seedCustomer(t, c, '55556666', 'Elena', 'elena@e.com');
    await eraseCustomer(env.DB, {
      tenantId: t,
      branchId: uniqueId('b'),
      actorUserId: uniqueId('u'),
      customerId: c,
      nowIso: NOW,
    });
    await expect(
      eraseCustomer(env.DB, {
        tenantId: t,
        branchId: uniqueId('b'),
        actorUserId: uniqueId('u'),
        customerId: c,
        nowIso: NOW,
      }),
    ).rejects.toThrow(ALREADY_ERASED);
  });

  it('no filtra PII de otro tenant en erase (LPDP-04)', async () => {
    const t = uniqueId('t');
    const c = uniqueId('c');
    await seedCustomer(t, c, '77778888', 'Fabi', 'fabi@f.com');
    const saleId = uniqueId('s');
    await seedSale(t, saleId, c, 'Fabi Torres', '77778888');
    await expect(
      eraseCustomer(env.DB, {
        tenantId: uniqueId('t'),
        branchId: uniqueId('b'),
        actorUserId: uniqueId('u'),
        customerId: c,
        nowIso: NOW,
      }),
    ).rejects.toThrow('CUSTOMER_NOT_FOUND');
    const intact = await env.DB.prepare(
      `SELECT client_name FROM sales WHERE tenant_id = ? AND id = ?`,
    )
      .bind(t, saleId)
      .first<{ client_name: string }>();
    expect(intact?.client_name).toBe('Fabi Torres');
  });
});
