import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runBatch, runD1AtomicPlan } from './index.js';
import {
  DOWN_0000_SCHEMA_META,
  DOWN_0001_DDL_BASE,
  DOWN_0002_WEBHOOK_EVENTS,
  DOWN_0003_ATOMIC_GUARDS,
} from './migrations-down.js';
import upSql from '../migrations/0001_ddl_base_v8.sql?raw';
import webhookEventsSql from '../migrations/0002_webhook_events.sql?raw';
import atomicGuardsSql from '../migrations/0003_atomic_guards.sql?raw';

async function seedTenantBranchSession(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'Demo SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
       VALUES (?, ?, ?, ?)`,
    ).bind(registerId, tenantId, branchId, 'Caja 1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(sessionId, tenantId, branchId, registerId, userId, 0),
  ]);

  return { branchId, sessionId, userId };
}

describe('D1 migraciones base (Sprint 0 humo + Sprint 1 DDL)', () => {
  it('db.batch escribe y lee schema_meta (humo Sprint 0)', async () => {
    const insert = env.DB.prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)`).bind(
      'smoke',
      'ok',
    );
    const results = await runBatch(env.DB, [insert]);
    expect(results.every((r) => r.success)).toBe(true);

    const row = await env.DB.prepare(`SELECT value FROM schema_meta WHERE key = ?`)
      .bind('smoke')
      .first<{ value: string }>();
    expect(row?.value).toBe('ok');
  });

  it('DDL base: tenants.ruc es nullable y existe branch_document_series', async () => {
    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('t-ruc', 'Demo SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')
      .run();

    const tenant = await env.DB.prepare(`SELECT ruc FROM tenants WHERE id = ?`)
      .bind('t-ruc')
      .first<{ ruc: string | null }>();
    expect(tenant?.ruc).toBeNull();

    const series = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='branch_document_series'`,
    ).first<{ name: string }>();
    expect(series?.name).toBe('branch_document_series');
  });

  it('cero columnas monetarias REAL; *_cents son INTEGER (migración 0001)', () => {
    const moneyHint =
      /(amount|total|price|cost|fee|balance|subtotal|igv|discount|payment|cash|change|paid|debt|credit|tender|revenue|margin)/i;
    const violations: string[] = [];
    for (const line of upSql.split('\n')) {
      const stripped = line.split('--')[0] ?? line;
      const m = stripped.match(
        /^\s*([a-z_][a-z0-9_]*)\s+(INTEGER|REAL|TEXT|BLOB|BOOLEAN|NUMERIC)\b/i,
      );
      if (!m) continue;
      const [, col, typ] = m;
      const t = typ.toUpperCase();
      if (col.endsWith('_cents') && t !== 'INTEGER') {
        violations.push(`${col} es ${t}`);
      }
      if (
        moneyHint.test(col) &&
        t === 'REAL' &&
        !/(qty|rate|percent|factor|weight|exchange)/i.test(col)
      ) {
        violations.push(`${col} REAL monetario`);
      }
    }
    expect(violations).toEqual([]);
    expect(upSql).toMatch(/total_amount_cents\s+INTEGER/);
  });

  it('rechaza FK huérfana (PRAGMA foreign_keys=ON)', async () => {
    await env.DB.exec('PRAGMA foreign_keys = ON');
    await expect(
      env.DB.prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind('b-orphan', 'tenant-inexistente', 'X01', 'Huérfana', 'Lima')
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('t-fk', 'FK SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')
      .run();
    await env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('b-fk', 't-fk', 'F01', 'Válida', 'Lima')
      .run();
    const row = await env.DB.prepare(`SELECT id FROM branches WHERE id = ?`)
      .bind('b-fk')
      .first<{ id: string }>();
    expect(row?.id).toBe('b-fk');
  });

  it('índices únicos parciales canónicos existen en sqlite_master', async () => {
    const indexes = await env.DB.prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'index' AND sql IS NOT NULL`,
    ).all<{ name: string; sql: string }>();
    const byName = new Map(indexes.results.map((r) => [r.name, r.sql]));

    const required: ReadonlyArray<{ name: string; mustMatch: RegExp }> = [
      { name: 'idx_tenants_ruc', mustMatch: /WHERE\s+ruc\s+IS\s+NOT\s+NULL/i },
      { name: 'idx_branches_tenant_code', mustMatch: /WHERE\s+deleted_at\s+IS\s+NULL/i },
      { name: 'idx_users_tenant_email', mustMatch: /WHERE\s+deleted_at\s+IS\s+NULL/i },
      {
        name: 'idx_sales_offline_id',
        mustMatch: /WHERE\s+offline_client_sale_id\s+IS\s+NOT\s+NULL/i,
      },
      { name: 'idx_sales_series_number', mustMatch: /sales\s*\(/i },
    ];

    for (const req of required) {
      const sql = byName.get(req.name);
      expect(sql, `falta índice ${req.name}`).toBeTruthy();
      expect(sql, `${req.name} no cumple predicado`).toMatch(req.mustMatch);
    }
  });

  it('correlativo único por tenant+branch+tipo+serie+número', async () => {
    const { branchId, sessionId, userId } = await seedTenantBranchSession('t-uniq');

    const insertSale = (id: string, number: number) =>
      env.DB.prepare(
        `INSERT INTO sales (
           id, tenant_id, branch_id, cash_register_session_id, user_id,
           client_document_type, client_document_number, client_name,
           document_type, series, number, currency, total_amount_cents, issued_at_lima
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        't-uniq',
        branchId,
        sessionId,
        userId,
        '1',
        '00000000',
        'Cliente',
        '03',
        'B001',
        number,
        'PEN',
        100,
        '2026-08-04T10:00:00',
      );

    await insertSale('sale-1', 1).run();
    await expect(insertSale('sale-2', 1).run()).rejects.toThrow();
  });

  it('migración 0002: webhook_events tenant_id NOT NULL + UNIQUE(source,event_id)', async () => {
    expect(webhookEventsSql).toMatch(/tenant_id\s+TEXT\s+NOT\s+NULL/i);
    expect(webhookEventsSql).toMatch(/UNIQUE\s*\(\s*source\s*,\s*event_id\s*\)/i);

    await env.DB.prepare(
      `INSERT INTO webhook_events (id, tenant_id, source, event_id, status, attempt_count)
       VALUES (?, ?, 'stripe', ?, 'PROCESSING', 1)`,
    )
      .bind('we-1', 't-wh', 'evt_1')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO webhook_events (id, tenant_id, source, event_id, status, attempt_count)
         VALUES (?, ?, 'stripe', ?, 'PROCESSING', 1)`,
      )
        .bind('we-2', 't-wh', 'evt_1')
        .run(),
    ).rejects.toThrow();

    const row = await env.DB.prepare(
      `SELECT status FROM webhook_events WHERE source = 'stripe' AND event_id = ?`,
    )
      .bind('evt_1')
      .first<{ status: string }>();
    expect(row?.status).toBe('PROCESSING');
  });

  it('migración 0003: atomic_guards CHECK ok=1 aborta batch sin efectos parciales', async () => {
    expect(atomicGuardsSql).toMatch(/CHECK\s*\(\s*ok\s*=\s*1\s*\)/i);

    await env.DB.prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)`)
      .bind('pre-guard', 'alive')
      .run();

    await expect(
      runD1AtomicPlan(
        env.DB,
        (plan) => {
          plan.add(
            env.DB.prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)`).bind(
              'should-rollback',
              'nope',
            ),
          );
        },
        { ok: false, guardId: 'guard-fail' },
      ),
    ).rejects.toThrow();

    const leaked = await env.DB.prepare(`SELECT value FROM schema_meta WHERE key = ?`)
      .bind('should-rollback')
      .first<{ value: string }>();
    expect(leaked).toBeNull();

    const alive = await env.DB.prepare(`SELECT value FROM schema_meta WHERE key = ?`)
      .bind('pre-guard')
      .first<{ value: string }>();
    expect(alive?.value).toBe('alive');

    await runD1AtomicPlan(
      env.DB,
      (plan) => {
        plan.add(
          env.DB.prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)`).bind(
            'post-guard',
            'ok',
          ),
        );
      },
      { ok: true, guardId: 'guard-ok' },
    );
    const row = await env.DB.prepare(`SELECT value FROM schema_meta WHERE key = ?`)
      .bind('post-guard')
      .first<{ value: string }>();
    expect(row?.value).toBe('ok');

    const guards = await env.DB.prepare(`SELECT COUNT(*) AS n FROM atomic_guards`).first<{
      n: number;
    }>();
    expect(guards?.n).toBe(0);
  });

  it('down 0003 + 0002 + 0001 + 0000 deja el schema sin tablas de negocio', async () => {
    await env.DB.exec(DOWN_0003_ATOMIC_GUARDS);
    await env.DB.exec(DOWN_0002_WEBHOOK_EVENTS);
    await env.DB.exec(DOWN_0001_DDL_BASE);
    await env.DB.exec(DOWN_0000_SCHEMA_META);

    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE 'd1_%'
         AND name != '_cf_METADATA'
       ORDER BY name`,
    ).all<{ name: string }>();

    expect(tables.results.map((t) => t.name)).toEqual([]);
  });
});
