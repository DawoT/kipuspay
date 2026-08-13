import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { processRemissionGuideAtomic } from './process-remission-guide-atomic.js';
import type { RemissionGuideRequest } from '@kipuspay/domain-fiscal-pe';

async function seedGreFixture(
  tenantId: string,
): Promise<{ branchId: string; userId: string; productId: string }> {
  const branchId = `b-${tenantId}`;
  const userId = `u-${tenantId}`;
  const productId = `p-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, 'ELECTRONIC_ISSUER')`,
    ).bind(tenantId, 'Remision SAC', 'retail', 'shard-1'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, ?)`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents)
       VALUES (?, ?, ?, ?, 'physical', 'NIU', 1000, 400)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto'),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, '31', 'T001', 7, 'INTERNAL')`,
    ).bind(`ser-t-${tenantId}`, tenantId, branchId),
  ]);

  return { branchId, userId, productId };
}

function request(productId: string): RemissionGuideRequest {
  return {
    series: 'T001',
    transferReasonCode: '13',
    transportModeCode: '02',
    vehiclePlate: 'ABC-123',
    carrier: { documentType: '01', documentNumber: '12345678', name: 'Carlos Ruiz' },
    origin: { ubigeo: '150101', address: 'Av. Lima 100' },
    destination: { ubigeo: '070101', address: 'Jr. Callao 200' },
    transferStartedAt: '2026-08-12T15:00:00.000Z',
    items: [
      { productId, quantityMicrounits: 5_000_000, uomCode: 'NIU' },
      { productId, quantityMicrounits: 2_500_000, uomCode: 'NIU' },
    ],
  };
}

describe('processRemissionGuideAtomic — integración D1 (P1b)', () => {
  it('persiste cabecera + ítems con correlativo y audit REMISSION_GUIDE; 0 stock', async () => {
    const tenantId = `t-gre-${Date.now()}`;
    const { branchId, userId, productId } = await seedGreFixture(tenantId);

    const res = await processRemissionGuideAtomic(
      env.DB,
      tenantId,
      branchId,
      userId,
      request(productId),
    );
    expect(res.number).toBe(8);

    const guide = await env.DB.prepare(
      `SELECT series, number, transfer_reason_code, transport_mode_code, sunat_status, transfer_started_at
         FROM remission_guides WHERE id = ?`,
    )
      .bind(res.remissionGuideId)
      .first<{
        series: string;
        number: number;
        transfer_reason_code: string;
        transport_mode_code: string;
        sunat_status: string;
        transfer_started_at: string;
      }>();
    expect(guide?.series).toBe('T001');
    expect(guide?.number).toBe(8);
    expect(guide?.transfer_reason_code).toBe('13');
    expect(guide?.transport_mode_code).toBe('02');
    expect(guide?.sunat_status).toBe('PENDING');
    expect(guide?.transfer_started_at).toBe('2026-08-12T15:00:00.000Z');

    const items = await env.DB.prepare(
      `SELECT quantity_microunits FROM remission_guide_items WHERE remission_guide_id = ? ORDER BY rowid`,
    )
      .bind(res.remissionGuideId)
      .all<{ quantity_microunits: number }>();
    expect(items.results).toHaveLength(2);
    expect(items.results[0]!.quantity_microunits).toBe(5_000_000);

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events WHERE tenant_id = ? AND action = 'REMISSION_GUIDE' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string }>();
    expect(audit?.action).toBe('REMISSION_GUIDE');

    const series = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser-t-${tenantId}`)
      .first<{ current_number: number }>();
    expect(series?.current_number).toBe(8);

    // La GRE no mueve stock de producto (0 impacto).
    const stock = await env.DB.prepare(`SELECT stock FROM products WHERE id = ?`)
      .bind(productId)
      .first<{ stock: number }>();
    expect(stock?.stock ?? 0).toBe(0);
  });

  it('rechaza motivo fuera del catálogo sin mover la serie', async () => {
    const tenantId = `t-gre-bad-${Date.now()}`;
    const { branchId, userId, productId } = await seedGreFixture(tenantId);

    await expect(
      processRemissionGuideAtomic(env.DB, tenantId, branchId, userId, {
        ...request(productId),
        transferReasonCode: '99',
      }),
    ).rejects.toThrow('INVALID_TRANSFER_REASON');

    const series = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE id = ?`,
    )
      .bind(`ser-t-${tenantId}`)
      .first<{ current_number: number }>();
    expect(series?.current_number).toBe(7);
  });
});
