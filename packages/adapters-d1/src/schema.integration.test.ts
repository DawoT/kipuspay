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
  DOWN_0018_SPRINT25_POS_TERMINALS,
  DOWN_0019_SPRINT26_FISCAL_OUTBOX_R2,
  DOWN_0020_SPRINT27_USAGE_BILLING,
  DOWN_0021_SPRINT28_SALES_RETURNS,
  DOWN_0022_SPRINT29_SUPPLIER_INVOICES,
  DOWN_0023_SPRINT30_PROMOTIONS,
  DOWN_0024_SPRINT31_VARIANTS_UOM,
  DOWN_0025_SPRINT32_LAYAWAY_JOURNAL,
  DOWN_0026_SPRINT33_QUOTES,
  DOWN_0027_SPRINT34_SUPPLIER_RETURNS,
  DOWN_0028_SPRINT35_STORE_CREDIT,
  DOWN_0029_SPRINT36_INSTALLMENTS,
  DOWN_0030_SPRINT37_COMMISSIONS,
  DOWN_0031_SPRINT38_INVENTORY_LOCATIONS,
  DOWN_0032_SPRINT39_INVENTORY_SERIALS,
  DOWN_0033_SPRINT40_INVENTORY_SCALE,
  DOWN_0034_SPRINT41_PRICE_LABELS,
  DOWN_0035_SPRINT42_DATA_BACKUP,
  DOWN_0036_SPRINT43_CUSTOMER_ORDERS,
  DOWN_0037_SPRINT44_RECURRING_SALES,
  DOWN_0038_SPRINT45_MOBILE_PUSH,
  DOWN_0039_SPRINT46_FORECASTING,
  DOWN_0040_SPRINT47_LPDP_CONSENT,
  DOWN_0041_SPRINT49_INSIGHTS,
} from './migrations-down.js';
import upSql from '../migrations/0001_ddl_base_v8.sql?raw';
import webhookEventsSql from '../migrations/0002_webhook_events.sql?raw';
import atomicGuardsSql from '../migrations/0003_atomic_guards.sql?raw';
import catalogImportSql from '../migrations/0013_catalog_import.sql?raw';
import sprint20PoSql from '../migrations/0014_sprint20_po_partial_status.sql?raw';
import sprint22PaymentsSql from '../migrations/0015_sprint22_payment_captures.sql?raw';
import sprint23ApiWebhooksSql from '../migrations/0016_sprint23_api_webhooks.sql?raw';
import sprint24LoyaltySql from '../migrations/0017_sprint24_loyalty_messaging.sql?raw';
import sprint25TerminalsSql from '../migrations/0018_sprint25_pos_terminals.sql?raw';
import sprint26FiscalR2Sql from '../migrations/0019_sprint26_fiscal_outbox_r2.sql?raw';
import sprint27UsageSql from '../migrations/0020_sprint27_usage_billing.sql?raw';
import sprint28ReturnsSql from '../migrations/0021_sprint28_sales_returns.sql?raw';
import sprint29ThreeWaySql from '../migrations/0022_sprint29_supplier_invoices.sql?raw';
import sprint30PromotionsSql from '../migrations/0023_sprint30_promotions.sql?raw';
import sprint31VariantsUomSql from '../migrations/0024_sprint31_variants_uom.sql?raw';
import sprint32LayawayJournalSql from '../migrations/0025_sprint32_layaway_journal.sql?raw';
import sprint33QuotesSql from '../migrations/0026_sprint33_quotes.sql?raw';
import sprint34SupplierReturnsSql from '../migrations/0027_sprint34_supplier_returns.sql?raw';
import sprint35StoreCreditSql from '../migrations/0028_sprint35_store_credit.sql?raw';
import sprint36InstallmentsSql from '../migrations/0029_sprint36_installments.sql?raw';
import sprint37CommissionsSql from '../migrations/0030_sprint37_commissions.sql?raw';
import sprint38LocationsSql from '../migrations/0031_sprint38_inventory_locations.sql?raw';
import sprint39SerialsSql from '../migrations/0032_sprint39_inventory_serials.sql?raw';
import sprint40ScaleSql from '../migrations/0033_sprint40_inventory_scale.sql?raw';
import sprint40ScaleDownSql from '../migrations-down/0033_sprint40_inventory_scale.sql?raw';
import sprint42BackupSql from '../migrations/0035_sprint42_data_backup.sql?raw';

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
      `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind('t-c2-race', branchId, 'p-c2', 10, 10000000, 500)
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
      `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 0, 0, 0)`,
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

  it('migración 0018 up: pos_terminals 58/80 + strategy CHECK', async () => {
    expect(sprint25TerminalsSql).toMatch(/CREATE TABLE IF NOT EXISTS pos_terminals/);
    expect(sprint25TerminalsSql).toMatch(
      /CHECK\s*\(\s*paper_width_mm\s+IN\s*\(\s*58\s*,\s*80\s*\)\s*\)/i,
    );

    await seedTenantBranchSession('t-term-up');
    await env.DB.prepare(
      `INSERT INTO pos_terminals (
         id, tenant_id, branch_id, label, paper_width_mm, line_width, printer_strategy
       ) VALUES (?, ?, ?, 'Caja 1', 58, 32, 'webusb')`,
    )
      .bind('pt-1', 't-term-up', 'b-t-term-up')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO pos_terminals (
           id, tenant_id, branch_id, paper_width_mm, line_width, printer_strategy
         ) VALUES (?, ?, ?, 99, 32, 'webusb')`,
      )
        .bind('pt-bad', 't-term-up', 'b-t-term-up')
        .run(),
    ).rejects.toThrow();

    const row = await env.DB.prepare(
      `SELECT line_width FROM pos_terminals WHERE id = ? AND tenant_id = ?`,
    )
      .bind('pt-1', 't-term-up')
      .first<{ line_width: number }>();
    expect(row?.line_width).toBe(32);
  });

  it('migración 0019 up: fiscal_outbox r2_xml_key + quarantine_reason', async () => {
    expect(sprint26FiscalR2Sql).toMatch(/r2_xml_key/);
    expect(sprint26FiscalR2Sql).toMatch(/quarantine_reason/);
    expect(sprint26FiscalR2Sql).toMatch(/idx_fiscal_outbox_must_submit/);
  });

  it('migración 0020 up: usage_counters + usage_events + billing_overages', async () => {
    expect(sprint27UsageSql).toMatch(/CREATE TABLE IF NOT EXISTS usage_counters/);
    expect(sprint27UsageSql).toMatch(/CREATE TABLE IF NOT EXISTS usage_events/);
    expect(sprint27UsageSql).toMatch(/CREATE TABLE IF NOT EXISTS billing_overages/);
    expect(sprint27UsageSql).toMatch(/stripe_idempotency_key/);
    expect(sprint27UsageSql).toMatch(/stripe_customer_id/);
    expect(sprint27UsageSql).toMatch(/billing\.usage_overage\.sprint27/);

    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('t-usage-up', 'Usage SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')
      .run();

    await env.DB.prepare(
      `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('ue-1', 't-usage-up', 'usage:doc-1', '2026-08', 'doc-1')
      .run();

    await env.DB.prepare(
      `INSERT INTO usage_counters (tenant_id, period_ym, doc_count, overage_reported_thru)
       VALUES (?, ?, 1, 0)
       ON CONFLICT(tenant_id, period_ym) DO UPDATE SET doc_count = doc_count + 1`,
    )
      .bind('t-usage-up', '2026-08')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind('ue-2', 't-usage-up', 'usage:doc-1', '2026-08', 'doc-1')
        .run(),
    ).rejects.toThrow();
  });

  it('migración 0021 up: return_policies + sales_returns + sale_return_items', async () => {
    expect(sprint28ReturnsSql).toMatch(/CREATE TABLE IF NOT EXISTS return_policies/);
    expect(sprint28ReturnsSql).toMatch(/CREATE TABLE IF NOT EXISTS sales_returns/);
    expect(sprint28ReturnsSql).toMatch(/CREATE TABLE IF NOT EXISTS sale_return_items/);
    expect(sprint28ReturnsSql).toMatch(/sales\.returns\.sprint28/);
  });

  it('migración 0022 up: supplier_invoices 3-way', async () => {
    expect(sprint29ThreeWaySql).toMatch(/CREATE TABLE IF NOT EXISTS supplier_invoices/);
    expect(sprint29ThreeWaySql).toMatch(/price_diff_override/);
    expect(sprint29ThreeWaySql).toMatch(/purchasing\.three_way\.sprint29/);
    expect(sprint29ThreeWaySql).toMatch(/CREATE TABLE IF NOT EXISTS supplier_invoice_lines/);
    expect(sprint29ThreeWaySql).toMatch(/CHECK \(status IN/);
    expect(sprint29ThreeWaySql).toMatch(/REFERENCES purchase_orders\(tenant_id, id\)/);
  });

  it('migración 0023 up: promotions DAT-12', async () => {
    expect(sprint30PromotionsSql).toMatch(/CREATE TABLE IF NOT EXISTS promotions/);
    expect(sprint30PromotionsSql).toMatch(/CREATE TABLE IF NOT EXISTS product_promotions/);
    expect(sprint30PromotionsSql).toMatch(/pricing\.promotions\.sprint30/);
    expect(sprint30PromotionsSql).toMatch(/REFERENCES promotions\(tenant_id, id\)/);
    expect(sprint30PromotionsSql).toMatch(/uq_promotions_tenant_id/);
  });

  it('migración 0024 up: variants/UOM + microunits DAT-12', async () => {
    expect(sprint31VariantsUomSql).toMatch(/CREATE TABLE IF NOT EXISTS product_uoms/);
    expect(sprint31VariantsUomSql).toMatch(/factor_numerator INTEGER NOT NULL/);
    expect(sprint31VariantsUomSql).toMatch(/factor_denominator INTEGER NOT NULL/);
    expect(sprint31VariantsUomSql).toMatch(/base_quantity_microunits INTEGER/);
    expect(sprint31VariantsUomSql).toMatch(
      /FOREIGN KEY \(tenant_id, product_id\) REFERENCES products\(tenant_id, id\)/,
    );
    expect(sprint31VariantsUomSql).toMatch(/catalog\.variants_uom\.sprint31/);
  });

  it('migración 0030 up: commissions DAT-12 cents ADR-0021 COM-07', async () => {
    expect(sprint37CommissionsSql).toMatch(/CREATE TABLE IF NOT EXISTS commission_rates/);
    expect(sprint37CommissionsSql).toMatch(/CREATE TABLE IF NOT EXISTS commission_payouts/);
    expect(sprint37CommissionsSql).toMatch(/CREATE TABLE IF NOT EXISTS commission_accruals/);
    expect(sprint37CommissionsSql).toMatch(
      /FOREIGN KEY \(tenant_id, seller_id\) REFERENCES users\(tenant_id, id\)/,
    );
    expect(sprint37CommissionsSql).toMatch(
      /FOREIGN KEY \(tenant_id, sale_id\) REFERENCES sales\(tenant_id, id\)/,
    );
    expect(sprint37CommissionsSql).toMatch(/sales\.commissions\.sprint37/);
    expect(sprint37CommissionsSql).not.toMatch(/FOREIGN KEY \(seller_id\) REFERENCES users\(id\)/);
  });

  it('migración 0031 up: locations DAT-12 microunits ADR-0022', async () => {
    expect(sprint38LocationsSql).toMatch(/CREATE TABLE IF NOT EXISTS inventory_locations/);
    expect(sprint38LocationsSql).toMatch(/CREATE TABLE IF NOT EXISTS inventory_location_stock/);
    expect(sprint38LocationsSql).toMatch(
      /CREATE TABLE IF NOT EXISTS inventory_location_batch_stock/,
    );
    expect(sprint38LocationsSql).toMatch(/quantity_microunits INTEGER NOT NULL/);
    expect(sprint38LocationsSql).toMatch(/FOREIGN KEY \(tenant_id, branch_id, location_id\)/);
    expect(sprint38LocationsSql).toMatch(/inventory\.locations\.sprint38/);
    expect(sprint38LocationsSql).not.toMatch(/\bqty REAL\b/);
  });

  it('migración 0032 up: seriales, leases y manifiestos cumplen DAT-12', () => {
    expect(sprint39SerialsSql).toMatch(/serial_tracking_mode TEXT NOT NULL DEFAULT 'NONE'/);
    expect(sprint39SerialsSql).toMatch(/CREATE TABLE IF NOT EXISTS serial_numbers/);
    expect(sprint39SerialsSql).toMatch(/CREATE TABLE IF NOT EXISTS serial_number_events/);
    expect(sprint39SerialsSql).toMatch(/CREATE TABLE IF NOT EXISTS serial_terminal_leases/);
    expect(sprint39SerialsSql).toMatch(/CREATE TABLE IF NOT EXISTS serial_manifests/);
    expect(sprint39SerialsSql).toMatch(/CREATE TABLE IF NOT EXISTS serial_manifest_items/);
    expect(sprint39SerialsSql).toMatch(/serial_number_normalized TEXT NOT NULL/);
    expect(sprint39SerialsSql).toMatch(/quantity_microunits INTEGER NOT NULL/);
    expect(sprint39SerialsSql).toMatch(/CHECK \(quantity_microunits = 1000000\)/);
    expect(sprint39SerialsSql).toMatch(
      /CHECK \(status IN \('AVAILABLE','RESERVED','SOLD','IN_TRANSIT','RETURNED_INSPECTION','LOST','DAMAGED','RETURNED_SUPPLIER'\)\)/,
    );
    expect(sprint39SerialsSql).toMatch(/UNIQUE \(tenant_id, serial_number_normalized\)/);
    expect(sprint39SerialsSql).toMatch(/UNIQUE \(tenant_id, id\)/);
    expect(sprint39SerialsSql).toMatch(
      /FOREIGN KEY \(tenant_id, product_id\) REFERENCES products\(tenant_id, id\)/,
    );
    expect(sprint39SerialsSql).toMatch(
      /FOREIGN KEY \(tenant_id, branch_id\) REFERENCES branches\(tenant_id, id\)/,
    );
    expect(sprint39SerialsSql).toMatch(
      /FOREIGN KEY \(tenant_id, serial_id\) REFERENCES serial_numbers\(tenant_id, id\)/,
    );
    expect(sprint39SerialsSql).toMatch(/UNIQUE \(tenant_id, serial_id\)/);
    expect(sprint39SerialsSql).toMatch(/SERIAL_EVENTS_APPEND_ONLY/);
    expect(DOWN_0032_SPRINT39_INVENTORY_SERIALS).toMatch(/INSERT INTO atomic_guards/);
    expect(DOWN_0032_SPRINT39_INVENTORY_SERIALS).toMatch(/status = 'ACTIVE'/);
    expect(DOWN_0032_SPRINT39_INVENTORY_SERIALS).toMatch(/status <> 'AVAILABLE'/);
    expect(DOWN_0032_SPRINT39_INVENTORY_SERIALS).toMatch(
      /stock\.quantity_microunits <> COUNT\(serial\.id\) \* 1000000/,
    );
    expect(sprint39SerialsSql).toMatch(/inventory\.serials\.sprint39/);
    expect(sprint39SerialsSql).not.toMatch(
      /FOREIGN KEY \((product_id|branch_id|serial_id)\) REFERENCES/,
    );
  });

  it('migración 0033 up: peso variable aplica DDL y protección down', async () => {
    expect(sprint40ScaleSql).toMatch(/CREATE TABLE tenant_weight_policies/);
    expect(sprint40ScaleSql).toMatch(/CREATE TABLE scale_devices/);
    expect(sprint40ScaleSql).toMatch(/CREATE TABLE weight_measurements/);
    expect(sprint40ScaleSql).toMatch(/inventory\.scale\.sprint40/);
    expect(DOWN_0033_SPRINT40_INVENTORY_SCALE).toMatch(/RAISE|atomic_guards/);
    const row = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'inventory.scale.sprint40'`,
    ).first<{ value: string }>();
    expect(row?.value).toBe('1');
    expect(sprint40ScaleDownSql.trim()).toBe(DOWN_0033_SPRINT40_INVENTORY_SCALE.trim());
  });

  it('migración 0035 registra backup KPBK1 y triggers canónicos de epoch', async () => {
    expect(sprint42BackupSql).toContain('data.backup.sprint42');
    expect(sprint42BackupSql).toContain('backup_epoch_products_insert');
    expect(sprint42BackupSql).toContain('backup_epoch_accounts_payable_payments_insert');
    const marker = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'data.backup.sprint42'`,
    ).first<{ value: string }>();
    expect(marker?.value).toBe('1');
    const triggers = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'trigger' AND name LIKE 'backup_epoch_%'`,
    ).first<{ n: number }>();
    expect(triggers?.n).toBeGreaterThan(100);
  });

  it('migración 0033 runtime: WEIGH, append-only y DAT-12 quedan enforced', async () => {
    const tenantA = 't-scale-a';
    const tenantB = 't-scale-b';
    const a = await seedTenantBranchSession(tenantA);
    const b = await seedTenantBranchSession(tenantB);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
         VALUES ('term-scale-a', ?, ?, 'Caja A')`,
      ).bind(tenantA, a.branchId),
      env.DB.prepare(
        `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
         VALUES ('term-scale-b', ?, ?, 'Caja B')`,
      ).bind(tenantB, b.branchId),
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents, stock_microunits
         ) VALUES ('product-scale-a', ?, 'SCALE-A', 'Pesable A', 'WEIGH', 'KGM', 199, 5000000)`,
      ).bind(tenantA),
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents, stock_microunits
         ) VALUES ('product-scale-b', ?, 'SCALE-B', 'Pesable B', 'WEIGH', 'KGM', 299, 5000000)`,
      ).bind(tenantB),
      env.DB.prepare(
        `INSERT INTO sales (
           id, tenant_id, branch_id, cash_register_session_id, user_id,
           client_document_type, client_document_number, client_name,
           document_type, series, number, total_amount_cents, issued_at_lima, sunat_status
         ) VALUES ('sale-scale-a', ?, ?, ?, ?, '0', '-', 'ANONIMO',
                   'NV', 'NV01', 40001, 100, CURRENT_TIMESTAMP, 'NOT_APPLICABLE')`,
      ).bind(tenantA, a.branchId, a.sessionId, a.userId),
      env.DB.prepare(
        `INSERT INTO sales (
           id, tenant_id, branch_id, cash_register_session_id, user_id,
           client_document_type, client_document_number, client_name,
           document_type, series, number, total_amount_cents, issued_at_lima, sunat_status
         ) VALUES ('sale-scale-b', ?, ?, ?, ?, '0', '-', 'ANONIMO',
                   'NV', 'NV01', 40002, 150, CURRENT_TIMESTAMP, 'NOT_APPLICABLE')`,
      ).bind(tenantB, b.branchId, b.sessionId, b.userId),
    ]);

    const saleItemSql = `INSERT INTO sale_items (
      id, tenant_id, sale_id, product_id, product_name, product_type, quantity,
      unit_price_cents, subtotal_cents, igv_amount_cents, total_amount_cents,
      base_quantity_microunits
    ) VALUES (?, ?, ?, ?, 'Pesable', 'WEIGH', 1, 199, 100, 0, 100, ?)`;
    await expect(
      env.DB.prepare(saleItemSql)
        .bind('line-scale-invalid', tenantA, 'sale-scale-a', 'product-scale-a', 0)
        .run(),
    ).rejects.toThrow(/WEIGHT_MICROUNITS_REQUIRED/);
    await env.DB.batch([
      env.DB.prepare(saleItemSql).bind(
        'line-scale-a',
        tenantA,
        'sale-scale-a',
        'product-scale-a',
        500000,
      ),
      env.DB.prepare(saleItemSql).bind(
        'line-scale-b',
        tenantB,
        'sale-scale-b',
        'product-scale-b',
        500000,
      ),
      env.DB.prepare(
        `INSERT INTO scale_devices (
           id, tenant_id, terminal_id, protocol, device_fingerprint
         ) VALUES ('device-scale-a', ?, 'term-scale-a', 'WEBHID', 'fingerprint-a')`,
      ).bind(tenantA),
      env.DB.prepare(
        `INSERT INTO scale_devices (
           id, tenant_id, terminal_id, protocol, device_fingerprint
         ) VALUES ('device-scale-b', ?, 'term-scale-b', 'WEBUSB', 'fingerprint-b')`,
      ).bind(tenantB),
    ]);
    await expect(
      env.DB.prepare(
        `UPDATE sale_items SET base_quantity_microunits = 0 WHERE id = 'line-scale-a'`,
      ).run(),
    ).rejects.toThrow(/WEIGHT_MICROUNITS_REQUIRED/);

    const measurementSql = `INSERT INTO weight_measurements (
      id, tenant_id, sale_item_id, product_id, terminal_id, scale_device_id,
      operation_type, operation_id, idempotency_key, weight_microunits,
      unit_price_per_base_cents, subtotal_cents, measurement_source,
      scale_protocol, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'SALE', ?, ?, 500000, 199, 100,
              'DEVICE', 'WEBHID', CURRENT_TIMESTAMP)`;
    await env.DB.prepare(measurementSql)
      .bind(
        'measurement-scale-a',
        tenantA,
        'line-scale-a',
        'product-scale-a',
        'term-scale-a',
        'device-scale-a',
        'sale-scale-a',
        'idem-scale-a',
      )
      .run();
    await expect(
      env.DB.prepare(
        `UPDATE weight_measurements SET weight_microunits = 600000
         WHERE id = 'measurement-scale-a'`,
      ).run(),
    ).rejects.toThrow(/WEIGHT_MEASUREMENTS_APPEND_ONLY/);
    await expect(
      env.DB.prepare(`DELETE FROM weight_measurements WHERE id = 'measurement-scale-a'`).run(),
    ).rejects.toThrow(/WEIGHT_MEASUREMENTS_APPEND_ONLY/);

    const crossTenantCases = [
      ['measurement-cross-terminal', 'line-scale-a', 'product-scale-a', 'term-scale-b', null],
      ['measurement-cross-product', 'line-scale-a', 'product-scale-b', 'term-scale-a', null],
      ['measurement-cross-line', 'line-scale-b', 'product-scale-a', 'term-scale-a', null],
      [
        'measurement-cross-device',
        'line-scale-a',
        'product-scale-a',
        'term-scale-a',
        'device-scale-b',
      ],
    ] as const;
    for (const [id, lineId, productId, terminalId, deviceId] of crossTenantCases) {
      await expect(
        env.DB.prepare(measurementSql)
          .bind(id, tenantA, lineId, productId, terminalId, deviceId, 'sale-scale-a', `idem-${id}`)
          .run(),
      ).rejects.toThrow();
    }
  });

  it('down 0033 aborta con datos activos y revierte un estado vacío', async () => {
    await expect(env.DB.exec(DOWN_0033_SPRINT40_INVENTORY_SCALE)).rejects.toThrow();

    await env.DB.exec(`DROP TRIGGER weight_measurements_no_delete`);
    await env.DB.prepare(`DELETE FROM weight_measurements`).run();
    await env.DB.prepare(`DELETE FROM scale_devices`).run();
    await env.DB.prepare(`DELETE FROM tenant_weight_policies`).run();
    await env.DB.prepare(
      `UPDATE sale_items SET product_type = 'physical' WHERE product_type = 'WEIGH'`,
    ).run();
    await env.DB.prepare(
      `UPDATE products SET product_type = 'physical' WHERE product_type = 'WEIGH'`,
    ).run();

    await env.DB.exec(DOWN_0033_SPRINT40_INVENTORY_SCALE);
    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'tenant_weight_policies', 'scale_devices', 'weight_measurements'
       )`,
    ).all<{ name: string }>();
    expect(tables.results).toEqual([]);
    const authColumns = await env.DB.prepare(`PRAGMA table_info(authorization_tokens)`).all<{
      name: string;
    }>();
    expect(authColumns.results.some((column) => column.name === 'action')).toBe(false);
  });

  it('down 0032 aborta con lease activo, estado no colapsable o drift', async () => {
    const { branchId } = await seedTenantBranchSession('t-serial-down');
    const locationId = 'loc-default:t-serial-down:b-t-serial-down';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents,
           serial_tracking_mode
         ) VALUES (?, ?, ?, 'Serializado', 'physical', 'NIU', 1000, 'REQUIRED')`,
      ).bind('p-serial-down', 't-serial-down', 'SKU-SERIAL-DOWN'),
      env.DB.prepare(
        `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
         VALUES (?, 't-serial-down', ?, 'DEFAULT', 'Default')`,
      ).bind(locationId, branchId),
      env.DB.prepare(
        `INSERT INTO inventory_location_stock (
           tenant_id, branch_id, location_id, product_id, quantity_microunits
         ) VALUES (?, ?, ?, ?, 1000000)`,
      ).bind('t-serial-down', branchId, locationId, 'p-serial-down'),
      env.DB.prepare(
        `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
         VALUES ('term-serial-down', 't-serial-down', ?, 'Caja serial')`,
      ).bind(branchId),
    ]);
    await env.DB.prepare(
      `INSERT INTO serial_numbers (
         id, tenant_id, branch_id, location_id, product_id,
         serial_number, serial_number_normalized
       ) VALUES ('serial-down', 't-serial-down', ?, ?, 'p-serial-down', 'SN-DOWN', 'SN-DOWN')`,
    )
      .bind(branchId, locationId)
      .run();
    await env.DB.prepare(
      `INSERT INTO serial_terminal_leases (
         id, tenant_id, serial_id, terminal_id, token_hash
       ) VALUES ('lease-down', 't-serial-down', 'serial-down', 'term-serial-down', 'hash-down')`,
    ).run();

    await expect(env.DB.exec(DOWN_0032_SPRINT39_INVENTORY_SERIALS)).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM serial_terminal_leases WHERE id = 'lease-down'`).run();

    await env.DB.prepare(
      `UPDATE serial_numbers SET status = 'SOLD' WHERE id = 'serial-down'`,
    ).run();
    await expect(env.DB.exec(DOWN_0032_SPRINT39_INVENTORY_SERIALS)).rejects.toThrow();
    await env.DB.prepare(
      `UPDATE serial_numbers SET status = 'AVAILABLE' WHERE id = 'serial-down'`,
    ).run();

    await env.DB.prepare(
      `UPDATE inventory_location_stock SET quantity_microunits = 2000000
       WHERE tenant_id = 't-serial-down' AND product_id = 'p-serial-down'`,
    ).run();
    await expect(env.DB.exec(DOWN_0032_SPRINT39_INVENTORY_SERIALS)).rejects.toThrow();
    await env.DB.prepare(
      `UPDATE inventory_location_stock SET quantity_microunits = 1000000
       WHERE tenant_id = 't-serial-down' AND product_id = 'p-serial-down'`,
    ).run();
  });

  it('migración 0029 up: installments DAT-12 cents ADR-0020 COM-06', async () => {
    expect(sprint36InstallmentsSql).toMatch(/CREATE TABLE IF NOT EXISTS sale_installments/);
    expect(sprint36InstallmentsSql).toMatch(/CREATE TABLE IF NOT EXISTS sale_installment_payments/);
    expect(sprint36InstallmentsSql).toMatch(
      /CHECK \(amount_cents = principal_cents \+ interest_cents\)/,
    );
    expect(sprint36InstallmentsSql).toMatch(
      /FOREIGN KEY \(tenant_id, sale_id\) REFERENCES sales\(tenant_id, id\)/,
    );
    expect(sprint36InstallmentsSql).toMatch(
      /FOREIGN KEY \(tenant_id, sale_installment_id\) REFERENCES sale_installments\(tenant_id, id\)/,
    );
    expect(sprint36InstallmentsSql).toMatch(/sales\.installments\.sprint36/);
    expect(sprint36InstallmentsSql).not.toMatch(/FOREIGN KEY \(sale_id\) REFERENCES sales\(id\)/);
  });

  it('migración 0028 up: store_credit DAT-12 cents ADR-0019', async () => {
    expect(sprint35StoreCreditSql).toMatch(/CREATE TABLE IF NOT EXISTS store_credit_accounts/);
    expect(sprint35StoreCreditSql).toMatch(/CREATE TABLE IF NOT EXISTS store_credit_transactions/);
    expect(sprint35StoreCreditSql).toMatch(/CHECK \(balance_cents >= 0\)/);
    expect(sprint35StoreCreditSql).toMatch(
      /FOREIGN KEY \(tenant_id, store_credit_account_id\) REFERENCES store_credit_accounts\(tenant_id, id\)/,
    );
    expect(sprint35StoreCreditSql).toMatch(
      /FOREIGN KEY \(tenant_id, sale_id\) REFERENCES sales\(tenant_id, id\)/,
    );
    expect(sprint35StoreCreditSql).toMatch(/ledger\.store_credit\.sprint35/);
    expect(sprint35StoreCreditSql).not.toMatch(
      /FOREIGN KEY \(store_credit_account_id\) REFERENCES store_credit_accounts\(id\)/,
    );
  });

  it('migración 0027 up: supplier_returns DAT-12/microunits ADR-0018', async () => {
    expect(sprint34SupplierReturnsSql).toMatch(/CREATE TABLE IF NOT EXISTS supplier_returns/);
    expect(sprint34SupplierReturnsSql).toMatch(/CREATE TABLE IF NOT EXISTS supplier_return_items/);
    expect(sprint34SupplierReturnsSql).toMatch(/base_quantity_microunits INTEGER NOT NULL/);
    expect(sprint34SupplierReturnsSql).toMatch(
      /FOREIGN KEY \(tenant_id, return_id\) REFERENCES supplier_returns\(tenant_id, id\)/,
    );
    expect(sprint34SupplierReturnsSql).toMatch(/purchasing\.returns\.sprint34/);
    expect(sprint34SupplierReturnsSql).not.toMatch(/\bqty REAL\b/);
  });

  it('migración 0026 up: quotes DAT-12/microunits COM-05', async () => {
    expect(sprint33QuotesSql).toMatch(/CREATE TABLE IF NOT EXISTS quotes/);
    expect(sprint33QuotesSql).toMatch(/CREATE TABLE IF NOT EXISTS quote_items/);
    expect(sprint33QuotesSql).toMatch(/base_quantity_microunits INTEGER NOT NULL/);
    expect(sprint33QuotesSql).toMatch(
      /FOREIGN KEY \(tenant_id, quote_id\) REFERENCES quotes\(tenant_id, id\)/,
    );
    expect(sprint33QuotesSql).toMatch(/sales\.quotes\.sprint33/);
    expect(sprint33QuotesSql).not.toMatch(/\bqty REAL\b/);
  });

  it('migración 0025 up: layaway + journal DAT-12/microunits', async () => {
    expect(sprint32LayawayJournalSql).toMatch(/CREATE TABLE IF NOT EXISTS sale_deposits/);
    expect(sprint32LayawayJournalSql).toMatch(/CREATE TABLE IF NOT EXISTS chart_of_accounts/);
    expect(sprint32LayawayJournalSql).toMatch(/base_quantity_microunits INTEGER NOT NULL/);
    expect(sprint32LayawayJournalSql).toMatch(/UNIQUE \(tenant_id, source_type, source_id\)/);
    expect(sprint32LayawayJournalSql).toMatch(/sales\.layaway_journal\.sprint32/);
    expect(sprint32LayawayJournalSql).toMatch(/'2101'/);
  });

  it('trigger 0024: rechaza variante con hijos y auto-parent en runtime', async () => {
    const tenantId = `t-${Math.random().toString(36).slice(2)}`;
    const product = `p-${Math.random().toString(36).slice(2)}`;
    const child = `p-${Math.random().toString(36).slice(2)}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(tenantId, 'Demo SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
      env.DB.prepare(
        `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents,
                              stock, stock_microunits, is_active, is_sellable)
         VALUES (?, ?, ?, 'Padre', 'physical', 'UND', 1000, 0, 0, 1, 1)`,
      ).bind(product, tenantId, `SKU-${product}`),
      env.DB.prepare(
        `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents,
                              stock, stock_microunits, is_active, is_sellable)
         VALUES (?, ?, ?, 'Hijo', 'physical', 'UND', 1000, 0, 0, 1, 1)`,
      ).bind(child, tenantId, `SKU-${child}`),
      env.DB.prepare(
        `INSERT INTO products (id, tenant_id, parent_product_id, sku, name, product_type,
                              unit_code, price_cents, stock, stock_microunits, is_active, is_sellable)
         VALUES (?, ?, ?, ?, 'Hijo-de-hijo', 'physical', 'UND', 1000, 0, 0, 1, 1)`,
      ).bind(`v-${child}`, tenantId, child, `SKU-v-${child}`),
    ]);

    // 1) auto-parent → VARIANT_SELF_PARENT
    await expect(
      env.DB.prepare(
        `UPDATE products SET parent_product_id = ?
         WHERE tenant_id = ? AND id = ?`,
      )
        .bind(product, tenantId, product)
        .run(),
    ).rejects.toThrow(/VARIANT_SELF_PARENT/);

    // 2) producto con hijos (child tiene un hijo) → VARIANT_NESTING_FORBIDDEN
    await expect(
      env.DB.prepare(
        `UPDATE products SET parent_product_id = ?
         WHERE tenant_id = ? AND id = ?`,
      )
        .bind(product, tenantId, child)
        .run(),
    ).rejects.toThrow(/VARIANT_NESTING_FORBIDDEN/);

    // 3) padre es variante (child es variante de product) → VARIANT_NESTING_FORBIDDEN
    await env.DB.prepare(
      `UPDATE products SET parent_product_id = ?
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(child, tenantId, product)
      .run();
    await expect(
      env.DB.prepare(
        `UPDATE products SET parent_product_id = ?
         WHERE tenant_id = ? AND id = ?`,
      )
        .bind(`v-${child}`, tenantId, child)
        .run(),
    ).rejects.toThrow(/VARIANT_NESTING_FORBIDDEN/);
  });

  it('down 0010 + 0009 + … + 0000 deja el schema sin tablas de negocio', async () => {
    await env.DB.exec(DOWN_0041_SPRINT49_INSIGHTS);
    await env.DB.exec(DOWN_0040_SPRINT47_LPDP_CONSENT);
    await env.DB.exec(DOWN_0039_SPRINT46_FORECASTING);
    await env.DB.exec(DOWN_0038_SPRINT45_MOBILE_PUSH);
    await env.DB.exec(DOWN_0037_SPRINT44_RECURRING_SALES);
    await env.DB.exec(DOWN_0036_SPRINT43_CUSTOMER_ORDERS);
    await env.DB.exec(DOWN_0035_SPRINT42_DATA_BACKUP);
    await env.DB.exec(DOWN_0034_SPRINT41_PRICE_LABELS);
    await env.DB.exec(DOWN_0032_SPRINT39_INVENTORY_SERIALS);
    await env.DB.exec(DOWN_0031_SPRINT38_INVENTORY_LOCATIONS);
    await env.DB.exec(DOWN_0030_SPRINT37_COMMISSIONS);
    await env.DB.exec(DOWN_0029_SPRINT36_INSTALLMENTS);
    await env.DB.exec(DOWN_0028_SPRINT35_STORE_CREDIT);
    await env.DB.exec(DOWN_0027_SPRINT34_SUPPLIER_RETURNS);
    await env.DB.exec(DOWN_0026_SPRINT33_QUOTES);
    await env.DB.exec(DOWN_0025_SPRINT32_LAYAWAY_JOURNAL);
    await env.DB.exec(DOWN_0024_SPRINT31_VARIANTS_UOM);
    await env.DB.exec(DOWN_0023_SPRINT30_PROMOTIONS);
    await env.DB.exec(DOWN_0022_SPRINT29_SUPPLIER_INVOICES);
    await env.DB.exec(DOWN_0021_SPRINT28_SALES_RETURNS);
    await env.DB.exec(DOWN_0020_SPRINT27_USAGE_BILLING);
    await env.DB.exec(DOWN_0019_SPRINT26_FISCAL_OUTBOX_R2);
    await env.DB.exec(DOWN_0018_SPRINT25_POS_TERMINALS);
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
