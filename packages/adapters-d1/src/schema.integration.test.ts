import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runBatch, runD1AtomicPlan } from './index.js';
import {
  createStockTransferAtomic,
  shipStockTransferAtomic,
} from './process-stock-transfer-atomic.js';
import { processPartialReceiveAtomic } from './process-partial-receive-atomic.js';
import {
  createPendingCaptureAtomic,
  settleCaptureAtomic,
} from './process-payment-capture-atomic.js';
import {
  claimWebhookDeliveryAtomic,
  enqueueWebhookDeliveryAtomic,
} from './process-webhook-delivery-atomic.js';
import {
  DOWN_0000_SCHEMA_META,
  DOWN_0001_DDL_BASE,
  DOWN_0002_WEBHOOK_EVENTS,
  DOWN_0003_ATOMIC_GUARDS,
  DOWN_0004_AUDIT_EVENTS,
  DOWN_0005_FISCAL_OUTBOX,
  DOWN_0006_FISCAL_ALERTS,
  DOWN_0007_DAILY_ROLLUPS,
  DOWN_0008_PUSH_SUBSCRIPTIONS,
  DOWN_0009_DAILY_PRODUCT_ROLLUPS,
  DOWN_0010_REFERRALS_BRAND_GROWTH,
  DOWN_0011_FASE6_COMMERCIAL_OPS,
  DOWN_0013_CATALOG_IMPORT,
  DOWN_0014_SPRINT20_PO_PARTIAL,
  DOWN_0015_SPRINT22_PAYMENT_CAPTURES,
  DOWN_0016_SPRINT23_API_WEBHOOKS,
  DOWN_0017_SPRINT24_LOYALTY_MESSAGING,
} from './migrations-down.js';
import upSql from '../migrations/0001_ddl_base_v8.sql?raw';
import webhookEventsSql from '../migrations/0002_webhook_events.sql?raw';
import atomicGuardsSql from '../migrations/0003_atomic_guards.sql?raw';
import catalogImportSql from '../migrations/0013_catalog_import.sql?raw';
import sprint20PoSql from '../migrations/0014_sprint20_po_partial_status.sql?raw';
import sprint22PaymentsSql from '../migrations/0015_sprint22_payment_captures.sql?raw';
import sprint23ApiWebhooksSql from '../migrations/0016_sprint23_api_webhooks.sql?raw';
import sprint24LoyaltySql from '../migrations/0017_sprint24_loyalty_messaging.sql?raw';

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

  it('migración 0004: audit_events append-only (UPDATE/DELETE abortan)', async () => {
    // 0004 ya aplicada por apply-migrations; solo ejercita triggers.
    await env.DB.prepare(
      `INSERT INTO audit_events (
         id, tenant_id, actor_user_id, action, entity_type, entity_id, payload_json, row_hash
       ) VALUES ('ae1', 't1', 'u1', 'OFFLINE_OVERSELL', 'sale_item', 's1', '{}', 'h1')`,
    ).run();

    await expect(
      env.DB.prepare(`UPDATE audit_events SET action = 'X' WHERE id = 'ae1'`).run(),
    ).rejects.toThrow(/AUDIT_APPEND_ONLY/);
    await expect(env.DB.prepare(`DELETE FROM audit_events WHERE id = 'ae1'`).run()).rejects.toThrow(
      /AUDIT_APPEND_ONLY/,
    );
  });

  it('migración 0013: external_entity_map con CHECK de source y entity_type (FIS-07)', async () => {
    expect(catalogImportSql).toMatch(
      /CHECK\s*\(\s*source\s+IN\s*\(\s*'bsale'\s*,\s*'alegra'\s*,\s*'csv'\s*\)\s*\)/i,
    );
    expect(catalogImportSql).toMatch(
      /CHECK\s*\(\s*entity_type\s+IN\s*\(\s*'product'\s*,\s*'customer'\s*,\s*'series'\s*\)\s*\)/i,
    );
    expect(catalogImportSql).toMatch(/tenant_id\s+TEXT\s+NOT\s+NULL/i);

    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('t-map-check', 'Map SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO external_entity_map
           (id, tenant_id, source, entity_type, external_id, internal_id)
         VALUES (?, ?, 'siigo', 'product', 'x1', 'p1')`,
      )
        .bind('em-bad-source', 't-map-check')
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO external_entity_map
           (id, tenant_id, source, entity_type, external_id, internal_id)
         VALUES (?, ?, 'csv', 'gadget', 'x1', 'p1')`,
      )
        .bind('em-bad-type', 't-map-check')
        .run(),
    ).rejects.toThrow();
  });

  it('migración 0014 up: purchase_orders.status acepta PARTIALLY_RECEIVED (runtime)', async () => {
    expect(sprint20PoSql).toMatch(/purchase_orders\.status\.partially_received/i);

    const { branchId, userId } = await seedTenantBranchSession('t-po-up');
    await env.DB.prepare(
      `INSERT INTO suppliers (id, tenant_id, ruc, business_name)
       VALUES (?, ?, ?, ?)`,
    )
      .bind('sup-po-up', 't-po-up', '20123456789', 'Proveedor A')
      .run();

    await env.DB.prepare(
      `INSERT INTO purchase_orders (
         id, tenant_id, branch_id, supplier_id, status, total_amount_cents,
         currency_code, created_by_user_id
       ) VALUES (?, ?, ?, ?, 'PARTIALLY_RECEIVED', ?, ?, ?)`,
    )
      .bind('po-up', 't-po-up', branchId, 'sup-po-up', 0, 'PEN', userId)
      .run();

    const row = await env.DB.prepare(
      `SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ?`,
    )
      .bind('po-up', 't-po-up')
      .first<{ status: string }>();
    expect(row?.status).toBe('PARTIALLY_RECEIVED');
  });

  it('migración 0015 up: payment_captures con CHECKs + UNIQUE(idempotency_key) en runtime', async () => {
    expect(sprint22PaymentsSql).toMatch(/CREATE TABLE IF NOT EXISTS payment_captures/);
    expect(sprint22PaymentsSql).toMatch(
      /CHECK\s*\(\s*status\s+IN\s*\(\s*'PENDING'\s*,\s*'CAPTURED'\s*,\s*'FAILED'\s*,\s*'REFUNDED'\s*,\s*'MANUAL_ELECTRONIC_CAPTURE'\s*\)\s*\)/i,
    );
    expect(sprint22PaymentsSql).toMatch(/UNIQUE\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i);

    const { branchId, sessionId, userId } = await seedTenantBranchSession('t-capt-up');
    await env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name)
       VALUES (?, ?, 'yape', 'Yape')`,
    )
      .bind('pm-up', 't-capt-up')
      .run();

    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, total_amount_cents, issued_at_lima
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'sale-up',
        't-capt-up',
        branchId,
        sessionId,
        userId,
        '1',
        '00000000',
        'Cliente',
        '03',
        'B001',
        1,
        'PEN',
        1000,
        '2026-08-04T10:00:00',
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO sale_payments (id, tenant_id, sale_id, payment_method_id, amount_cents)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('sp-up', 't-capt-up', 'sale-up', 'pm-up', 1000)
      .run();

    await env.DB.prepare(
      `INSERT INTO payment_captures (
         id, tenant_id, sale_id, sale_payment_id, acquirer, status, amount_cents, idempotency_key
       ) VALUES (?, ?, ?, ?, 'yape', 'PENDING', ?, ?)`,
    )
      .bind('cap-up', 't-capt-up', 'sale-up', 'sp-up', 1000, 'k-up')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO payment_captures (
           id, tenant_id, sale_id, sale_payment_id, acquirer, status, amount_cents, idempotency_key
         ) VALUES (?, ?, ?, ?, 'yape', 'BOGUS', ?, ?)`,
      )
        .bind('cap-bad', 't-capt-up', 'sale-up', 'sp-up', 1000, 'k-up-2')
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO payment_captures (
           id, tenant_id, sale_id, sale_payment_id, acquirer, status, amount_cents, idempotency_key
         ) VALUES (?, ?, ?, ?, 'yape', 'PENDING', ?, ?)`,
      )
        .bind('cap-dup', 't-capt-up', 'sale-up', 'sp-up', 1000, 'k-up')
        .run(),
    ).rejects.toThrow();

    const row = await env.DB.prepare(
      `SELECT status FROM payment_captures WHERE id = ? AND tenant_id = ?`,
    )
      .bind('cap-up', 't-capt-up')
      .first<{ status: string }>();
    expect(row?.status).toBe('PENDING');
  });

  it('migración 0016 up: api_keys/webhook_endpoints/deliveries con CHECKs + UNIQUE + FK', async () => {
    expect(sprint23ApiWebhooksSql).toMatch(/CREATE TABLE IF NOT EXISTS api_keys/);
    expect(sprint23ApiWebhooksSql).toMatch(/UNIQUE\s*\(\s*endpoint_id\s*,\s*event_id\s*\)/i);
    expect(sprint23ApiWebhooksSql).toMatch(
      /CHECK\s*\(\s*status\s+IN\s*\(\s*'PENDING'\s*,\s*'PROCESSING'\s*,\s*'DELIVERED'\s*,\s*'FAILED'\s*,\s*'DISABLED'\s*\)\s*\)/i,
    );

    await seedTenantBranchSession('t-wbh-up');
    await env.DB.prepare(
      `INSERT INTO api_keys (id, tenant_id, key_prefix, key_hash, status)
       VALUES (?, ?, ?, ?, 'active')`,
    )
      .bind('ak-up', 't-wbh-up', 'kp_live_abcdef01', 'salt:hash')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO api_keys (id, tenant_id, key_prefix, key_hash, status)
         VALUES (?, ?, ?, ?, 'BOGUS')`,
      )
        .bind('ak-bad', 't-wbh-up', 'kp_live_zzzzzz01', 'salt:hash')
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO api_keys (id, tenant_id, key_prefix, key_hash, status)
         VALUES (?, ?, ?, ?, 'active')`,
      )
        .bind('ak-dup', 't-wbh-up', 'kp_live_abcdef01', 'salt:hash')
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      `INSERT INTO webhook_endpoints (
         id, tenant_id, url, secret_hash, secret_kms_ref, secret_salt, events_json
       ) VALUES (?, ?, 'https://hooks.example.com/k', 'h', 'kms-ak', x'00', '["sale.created"]')`,
    )
      .bind('ep-up', 't-wbh-up')
      .run();

    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (
         id, tenant_id, endpoint_id, event_id, event_type, payload_json, status, attempt_count
       ) VALUES (?, ?, ?, ?, 'sale.created', '{}', 'PENDING', 0)`,
    )
      .bind('dl-up', 't-wbh-up', 'ep-up', 'evt-up')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO webhook_deliveries (
           id, tenant_id, endpoint_id, event_id, event_type, payload_json, status, attempt_count
         ) VALUES (?, ?, ?, ?, 'sale.created', '{}', 'PENDING', 0)`,
      )
        .bind('dl-dup', 't-wbh-up', 'ep-up', 'evt-up')
        .run(),
    ).rejects.toThrow();

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM webhook_deliveries WHERE tenant_id = ?`,
    )
      .bind('t-wbh-up')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('C2: doble ship concurrente sobre el mismo DRAFT → un solo débito (guardState)', async () => {
    const { branchId } = await seedTenantBranchSession('t-c2-race');
    const branchTo = `bt-${'t-c2-race'}`;
    const userId = `u-${'t-c2-race'}`;

    await env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'C02', 'Destino', 'Lima')`,
    )
      .bind(branchTo, 't-c2-race')
      .run();

    await env.DB.prepare(
      `INSERT INTO products (
         id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents
       ) VALUES (?, ?, ?, ?, 'physical', 'NIU', ?, ?)`,
    )
      .bind('p-c2', 't-c2-race', 'SKU-C2', 'Producto C2', 1000, 500)
      .run();

    await env.DB.prepare(
      `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, pmp_unit_cost_cents)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('t-c2-race', branchId, 'p-c2', 10, 500)
      .run();

    const created = await createStockTransferAtomic(env.DB, 't-c2-race', userId, {
      fromBranchId: branchId,
      toBranchId: branchTo,
      lines: [{ productId: 'p-c2', qtySent: 3 }],
    });

    const ships = await Promise.allSettled([
      shipStockTransferAtomic(env.DB, 't-c2-race', userId, created.id),
      shipStockTransferAtomic(env.DB, 't-c2-race', userId, created.id),
    ]);

    const fulfilled = ships.filter((r) => r.status === 'fulfilled').length;
    const rejected = ships.filter((r) => r.status === 'rejected').length;
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    )
      .bind('t-c2-race', branchId, 'p-c2')
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(7);

    const xfer = await env.DB.prepare(
      `SELECT status FROM stock_transfers WHERE id = ? AND tenant_id = ?`,
    )
      .bind(created.id, 't-c2-race')
      .first<{ status: string }>();
    expect(xfer?.status).toBe('IN_TRANSIT');
  });

  it('M1: recepción parcial OC con D1 real → PARTIALLY_RECEIVED + AP + stock', async () => {
    const { branchId, userId } = await seedTenantBranchSession('t-m1-po');
    await env.DB.prepare(
      `INSERT INTO suppliers (id, tenant_id, ruc, business_name)
       VALUES (?, ?, ?, ?)`,
    )
      .bind('sup-m1', 't-m1-po', '20123456789', 'Proveedor M1')
      .run();
    await env.DB.prepare(
      `INSERT INTO purchase_orders (
         id, tenant_id, branch_id, supplier_id, status, total_amount_cents,
         currency_code, created_by_user_id
       ) VALUES (?, ?, ?, ?, 'SENT', ?, 'PEN', ?)`,
    )
      .bind('po-m1', 't-m1-po', branchId, 'sup-m1', 0, userId)
      .run();
    await env.DB.prepare(
      `INSERT INTO purchase_order_items (
         id, purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost_cents
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind('poi-m1', 'po-m1', 'p-m1', 10, 0, 100)
      .run();
    await env.DB.prepare(
      `INSERT INTO products (
         id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents
       ) VALUES (?, ?, ?, ?, 'physical', 'NIU', ?, ?)`,
    )
      .bind('p-m1', 't-m1-po', 'SKU-M1', 'Producto M1', 1000, 500)
      .run();
    await env.DB.prepare(
      `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 0, 0)`,
    )
      .bind('t-m1-po', branchId, 'p-m1')
      .run();

    const res = await processPartialReceiveAtomic(env.DB, 't-m1-po', userId, {
      purchaseOrderId: 'po-m1',
      branchId,
      lines: [{ productId: 'p-m1', quantity: 4, unitCostCents: 100 }],
    });

    expect(res.nextStatus).toBe('PARTIALLY_RECEIVED');
    expect(res.apAmountCents).toBe(400);

    const po = await env.DB.prepare(`SELECT status FROM purchase_orders WHERE id = ?`)
      .bind('po-m1')
      .first<{ status: string }>();
    expect(po?.status).toBe('PARTIALLY_RECEIVED');

    const ap = await env.DB.prepare(
      `SELECT original_amount_cents, balance_due_cents, status FROM accounts_payable WHERE id = ?`,
    )
      .bind(res.apId)
      .first<{ original_amount_cents: number; balance_due_cents: number; status: string }>();
    expect(ap?.original_amount_cents).toBe(400);
    expect(ap?.balance_due_cents).toBe(400);
    expect(ap?.status).toBe('OPEN');

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    )
      .bind('t-m1-po', branchId, 'p-m1')
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(4);

    const receipts = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM purchase_receipts WHERE tenant_id = ? AND purchase_order_id = ?`,
    )
      .bind('t-m1-po', 'po-m1')
      .first<{ n: number }>();
    expect(receipts?.n).toBe(1);
  });

  it('C2: doble settle concurrente sobre el mismo PENDING → un solo CAPTURED (guardState)', async () => {
    const { branchId, sessionId, userId } = await seedTenantBranchSession('t-c2-set');
    await env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name)
       VALUES (?, ?, 'yape', 'Yape')`,
    )
      .bind('pm-set', 't-c2-set')
      .run();
    await env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, total_amount_cents, issued_at_lima
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'sale-set',
        't-c2-set',
        branchId,
        sessionId,
        userId,
        '1',
        '00000000',
        'Cliente',
        '03',
        'B001',
        1,
        'PEN',
        1000,
        '2026-08-04T10:00:00',
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO sale_payments (id, tenant_id, sale_id, payment_method_id, amount_cents)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('sp-set', 't-c2-set', 'sale-set', 'pm-set', 1000)
      .run();

    const created = await createPendingCaptureAtomic(env.DB, 't-c2-set', {
      saleId: 'sale-set',
      salePaymentId: 'sp-set',
      methodCode: 'yape',
      amountCents: 1000,
      idempotencyKey: 'set:0:yape',
    });

    const settles = await Promise.allSettled([
      settleCaptureAtomic(env.DB, 't-c2-set', {
        captureId: created.id,
        toStatus: 'CAPTURED',
        acquirerRef: 'ref-1',
      }),
      settleCaptureAtomic(env.DB, 't-c2-set', {
        captureId: created.id,
        toStatus: 'CAPTURED',
        acquirerRef: 'ref-2',
      }),
    ]);

    const fulfilled = settles.filter((r) => r.status === 'fulfilled').length;
    expect(fulfilled).toBe(1);

    const cap = await env.DB.prepare(
      `SELECT status FROM payment_captures WHERE id = ? AND tenant_id = ?`,
    )
      .bind(created.id, 't-c2-set')
      .first<{ status: string }>();
    expect(cap?.status).toBe('CAPTURED');
  });

  it('C1: doble enqueue concurrente del mismo (endpoint,event) → 1 fila, sin throw (idempotente)', async () => {
    await seedTenantBranchSession('t-c1-wbh');
    await env.DB.prepare(
      `INSERT INTO webhook_endpoints (
         id, tenant_id, url, secret_hash, secret_kms_ref, secret_salt, events_json
       ) VALUES (?, ?, 'https://hooks.example.com/k', 'h', 'kms-c1', x'00', '["sale.created"]')`,
    )
      .bind('ep-c1', 't-c1-wbh')
      .run();

    const enqueues = await Promise.allSettled([
      enqueueWebhookDeliveryAtomic(env.DB, 't-c1-wbh', {
        endpointId: 'ep-c1',
        eventId: 'evt-c1',
        eventType: 'sale.created',
        payloadJson: '{"id":"s1"}',
      }),
      enqueueWebhookDeliveryAtomic(env.DB, 't-c1-wbh', {
        endpointId: 'ep-c1',
        eventId: 'evt-c1',
        eventType: 'sale.created',
        payloadJson: '{"id":"s1"}',
      }),
    ]);

    expect(enqueues.every((r) => r.status === 'fulfilled')).toBe(true);

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM webhook_deliveries WHERE tenant_id = ? AND endpoint_id = ?`,
    )
      .bind('t-c1-wbh', 'ep-c1')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('C2: doble claim concurrente de la misma delivery → exactamente un ok:true', async () => {
    await seedTenantBranchSession('t-c2-wbh');
    await env.DB.prepare(
      `INSERT INTO webhook_endpoints (
         id, tenant_id, url, secret_hash, secret_kms_ref, secret_salt, events_json
       ) VALUES (?, ?, 'https://hooks.example.com/k', 'h', 'kms-c2', x'00', '["sale.created"]')`,
    )
      .bind('ep-c2', 't-c2-wbh')
      .run();
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (
         id, tenant_id, endpoint_id, event_id, event_type, payload_json, status, attempt_count
       ) VALUES (?, ?, ?, ?, 'sale.created', '{}', 'PENDING', 0)`,
    )
      .bind('dl-c2', 't-c2-wbh', 'ep-c2', 'evt-c2')
      .run();

    const claims = await Promise.all([
      claimWebhookDeliveryAtomic(env.DB, 't-c2-wbh', 'dl-c2'),
      claimWebhookDeliveryAtomic(env.DB, 't-c2-wbh', 'dl-c2'),
    ]);

    const okCount = claims.filter((c) => c.ok).length;
    expect(okCount).toBe(1);

    const row = await env.DB.prepare(
      `SELECT status, attempt_count FROM webhook_deliveries WHERE id = ? AND tenant_id = ?`,
    )
      .bind('dl-c2', 't-c2-wbh')
      .first<{ status: string; attempt_count: number }>();
    expect(row?.status).toBe('PROCESSING');
    expect(row?.attempt_count).toBe(1);
  });

  it('migración 0017 up: loyalty_accounts/reservations + messaging_opt_ins', async () => {
    expect(sprint24LoyaltySql).toMatch(/CREATE TABLE IF NOT EXISTS loyalty_accounts/);
    expect(sprint24LoyaltySql).toMatch(/CREATE TABLE IF NOT EXISTS loyalty_reservations/);
    expect(sprint24LoyaltySql).toMatch(/CREATE TABLE IF NOT EXISTS messaging_opt_ins/);
    expect(sprint24LoyaltySql).toMatch(
      /CHECK\s*\(\s*status\s+IN\s*\(\s*'RESERVED'\s*,\s*'REDEEMED'\s*,\s*'EXPIRED'\s*,\s*'CANCELLED'\s*\)\s*\)/i,
    );

    await seedTenantBranchSession('t-loy-up');
    await env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name)
       VALUES (?, ?, '1', '12345678', 'Cliente Loyalty')`,
    )
      .bind('c-loy', 't-loy-up')
      .run();

    await env.DB.prepare(
      `INSERT INTO loyalty_accounts (id, tenant_id, customer_id, points_balance)
       VALUES (?, ?, ?, ?)`,
    )
      .bind('la-up', 't-loy-up', 'c-loy', 100)
      .run();

    await env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name)
       VALUES (?, ?, '1', '87654321', 'Neg')`,
    )
      .bind('c-loy-2', 't-loy-up')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO loyalty_accounts (id, tenant_id, customer_id, points_balance)
         VALUES (?, ?, ?, ?)`,
      )
        .bind('la-neg', 't-loy-up', 'c-loy-2', -1)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      `INSERT INTO loyalty_reservations (
         id, tenant_id, customer_id, sale_idempotency_key, points, status, expires_at
       ) VALUES (?, ?, ?, ?, ?, 'RESERVED', '2026-08-06 12:00:00')`,
    )
      .bind('lr-up', 't-loy-up', 'c-loy', 'sale-idem-1', 10)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO loyalty_reservations (
           id, tenant_id, customer_id, sale_idempotency_key, points, status, expires_at
         ) VALUES (?, ?, ?, ?, ?, 'RESERVED', '2026-08-06 13:00:00')`,
      )
        .bind('lr-dup', 't-loy-up', 'c-loy', 'sale-idem-1', 5)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      `INSERT INTO messaging_opt_ins (id, tenant_id, customer_id, channel, opted_in)
       VALUES (?, ?, ?, 'whatsapp', ?)`,
    )
      .bind('mo-up', 't-loy-up', 'c-loy', 1)
      .run();

    const opt = await env.DB.prepare(
      `SELECT opted_in FROM messaging_opt_ins WHERE tenant_id = ? AND customer_id = ?`,
    )
      .bind('t-loy-up', 'c-loy')
      .first<{ opted_in: number }>();
    expect(opt?.opted_in).toBe(1);
  });

  it('down 0010 + 0009 + … + 0000 deja el schema sin tablas de negocio', async () => {
    await env.DB.exec(DOWN_0017_SPRINT24_LOYALTY_MESSAGING);
    await env.DB.exec(DOWN_0016_SPRINT23_API_WEBHOOKS);
    await env.DB.exec(DOWN_0015_SPRINT22_PAYMENT_CAPTURES);
    await env.DB.exec(DOWN_0014_SPRINT20_PO_PARTIAL);
    await env.DB.exec(DOWN_0013_CATALOG_IMPORT);
    await env.DB.exec(DOWN_0011_FASE6_COMMERCIAL_OPS);
    await env.DB.exec(DOWN_0010_REFERRALS_BRAND_GROWTH);
    await env.DB.exec(DOWN_0009_DAILY_PRODUCT_ROLLUPS);
    await env.DB.exec(DOWN_0008_PUSH_SUBSCRIPTIONS);
    await env.DB.exec(DOWN_0007_DAILY_ROLLUPS);
    await env.DB.exec(DOWN_0006_FISCAL_ALERTS);
    await env.DB.exec(DOWN_0005_FISCAL_OUTBOX);
    await env.DB.exec(DOWN_0004_AUDIT_EVENTS);
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
