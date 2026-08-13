import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  captureAttributionD1,
  ensureReferralCodeD1,
  insertGrowthEventD1,
  loadAttributionForTenant,
  markAttributionCreditedD1,
} from './referral-d1.js';

async function seedTenants(...ids: string[]): Promise<void> {
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, 'Referido', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      ).bind(id),
    ),
  );
}

describe('S12-H1: referidos persistidos en D1 (migración 0010)', () => {
  it('ensureReferralCodeD1: crea y es idempotente; código único por tenant', async () => {
    await seedTenants('t-ref-d1-a');
    const first = await ensureReferralCodeD1(env.DB, 't-ref-d1-a', 'KIPUS-ABC');
    expect(first.code).toBe('KIPUS-ABC');
    const again = await ensureReferralCodeD1(env.DB, 't-ref-d1-a', 'KIPUS-ABC');
    expect(again.code).toBe('KIPUS-ABC');
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM referral_codes WHERE tenant_id = ?`,
    )
      .bind('t-ref-d1-a')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('captura atribución persistente; UNIQUE por referido (1 sola vez)', async () => {
    await seedTenants('t-ref-d1-referrer', 't-ref-d1-referred');
    await captureAttributionD1(env.DB, {
      id: 'attr-d1-1',
      referredTenantId: 't-ref-d1-referred',
      referrerTenantId: 't-ref-d1-referrer',
      code: 'KIPUS-ABC',
    });
    const attr = await loadAttributionForTenant(env.DB, 't-ref-d1-referred');
    expect(attr?.referrer_tenant_id).toBe('t-ref-d1-referrer');
    expect(attr?.status).toBe('captured');
    expect(attr?.credit_days).toBe(30);
  });

  it('primera venta → credited + growth_event referral_credited', async () => {
    await seedTenants('t-ref-d1-r2', 't-ref-d1-v2');
    await captureAttributionD1(env.DB, {
      id: 'attr-d1-2',
      referredTenantId: 't-ref-d1-v2',
      referrerTenantId: 't-ref-d1-r2',
      code: 'KIPUS-DEF',
    });
    await markAttributionCreditedD1(env.DB, {
      attributionId: 'attr-d1-2',
      referredTenantId: 't-ref-d1-v2',
      referrerTenantId: 't-ref-d1-r2',
      nowIso: '2026-08-12T00:00:00.000Z',
    });
    const attr = await loadAttributionForTenant(env.DB, 't-ref-d1-v2');
    expect(attr?.status).toBe('credited');
    const ev = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM growth_events
       WHERE tenant_id = ? AND event_type = 'referral_credited'`,
    )
      .bind('t-ref-d1-v2')
      .first<{ n: number }>();
    expect(ev?.n).toBe(1);
  });

  it('insertGrowthEventD1 registra first_sale con meta', async () => {
    await seedTenants('t-ref-d1-fs');
    await insertGrowthEventD1(env.DB, {
      tenantId: 't-ref-d1-fs',
      eventType: 'first_sale',
      occurredAtIso: '2026-08-12T00:00:00.000Z',
      meta: { docType: 'NV' },
    });
    const ev = await env.DB.prepare(
      `SELECT event_type, meta_json FROM growth_events WHERE tenant_id = ?`,
    )
      .bind('t-ref-d1-fs')
      .first<{ event_type: string; meta_json: string | null }>();
    expect(ev?.event_type).toBe('first_sale');
    expect(JSON.parse(ev?.meta_json ?? '{}')).toEqual({ docType: 'NV' });
  });
});
