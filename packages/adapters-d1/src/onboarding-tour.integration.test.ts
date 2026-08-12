import { env } from 'cloudflare:workers';
import { afterAll, describe, expect, it } from 'vitest';

// El down protegido de 0044 aborta si existen eventos nuevos (diseño): los
// fixtures de este archivo se limpian para dejar la DB en estado pre-sprint.
const createdTenants: string[] = [];

afterAll(async () => {
  for (const tenantId of createdTenants) {
    await env.DB.prepare(`DELETE FROM growth_events WHERE tenant_id = ?`).bind(tenantId).run();
    await env.DB.prepare(`DELETE FROM users WHERE tenant_id = ?`).bind(tenantId).run();
    await env.DB.prepare(`DELETE FROM tenant_data_epochs WHERE tenant_id = ?`).bind(tenantId).run();
    await env.DB.prepare(`DELETE FROM tenants WHERE id = ?`).bind(tenantId).run();
  }
});

async function seedTenant(tenantId: string): Promise<void> {
  createdTenants.push(tenantId);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, 'INTERNAL_CONTROL')`,
    ).bind(tenantId, 'Onboarding SAC', 'retail', 'shard-1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, NULL, ?, 'owner')`,
    ).bind(`u-${tenantId}`, tenantId, `owner-${tenantId}@example.com`),
  ]);
}

describe('onboarding.tour data contract (Sprint 52, D1 real)', () => {
  it('growth_events acepta los 5 eventos nuevos del CHECK 0044', async () => {
    const tenantId = `t-check-${Date.now()}`;
    await seedTenant(tenantId);
    const types = [
      'tour_started',
      'tour_completed',
      'tour_dismissed',
      'setup_checklist_step_completed',
      'setup_checklist_completed',
    ];
    for (const eventType of types) {
      await env.DB.prepare(
        `INSERT INTO growth_events (id, tenant_id, event_type, meta_json)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(`g-${eventType}-${tenantId}`, tenantId, eventType, null)
        .run();
    }
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM growth_events WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(types.length);
  });

  it('el CHECK rechaza un evento fuera del catálogo (DAT-04 en DB)', async () => {
    const tenantId = `t-check-hack-${Date.now()}`;
    await seedTenant(tenantId);
    await expect(
      env.DB.prepare(`INSERT INTO growth_events (id, tenant_id, event_type) VALUES (?, ?, 'hack')`)
        .bind(`g-hack-${tenantId}`, tenantId)
        .run(),
    ).rejects.toThrow();
  });

  it('setup-progress: las queries de estado server devuelven el contrato', async () => {
    const tenantId = `t-progress-${Date.now()}`;
    await seedTenant(tenantId);
    const row = await env.DB.prepare(
      `SELECT t.logo_url,
                t.formalization_mode,
                CASE WHEN EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = t.id) THEN 1 ELSE 0 END AS has_catalog,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS team_size
         FROM tenants t WHERE t.id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first<{
        logo_url: string | null;
        formalization_mode: string;
        has_catalog: number;
        team_size: number;
      }>();
    expect(row).not.toBeNull();
    expect(row!.formalization_mode).toBe('INTERNAL_CONTROL');
    expect(row!.logo_url).toBeNull();
    expect(row!.has_catalog).toBe(0);
    expect(row!.team_size).toBe(1);
  });
});
