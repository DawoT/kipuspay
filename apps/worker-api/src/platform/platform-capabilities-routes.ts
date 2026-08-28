/* eslint-disable */
/**
 * Ola 3 — Control Plane SuperAdmin: tenant_capabilities (ADR-ARCH-003).
 * Endpoints:
 *  PATCH /platform/tenants/:id/capabilities {capability, enabled, config_json?}
 *    → db.batch([REPLACE tenant_capabilities, INSERT audit_events CAPABILITY_UPDATE, UPDATE tenant_data_epochs epoch+1])
 *  GET /platform/tenants/:id/capabilities → lista completa
 *  GET /platform/tenants → lista tenants con plan_id, subscriptionStatus
 *
 * Seguridad: tenant_id del path param nunca del body, validación tenant existe,
 * capability en lista canónica 77, enabled 0/1, audit append-only, fail-closed 503.
 * Nunca toca session/store ni plan upgrade.
 */
import type { PlatformAuthEnv } from './platform-auth.js';
import { auditChainClaimStatements, readAuditChainHead } from '@kipuspay/adapters-d1';

export const CANONICAL_CAPABILITIES: readonly string[] = [
  'analytics.agentic_insights',
  'analytics.forecasting',
  'analytics.growth_metrics',
  'audit.sensitive_actions',
  'auth.cashier_login',
  'cash.blind_z',
  'cash.discount_authz',
  'cash.register_expenses',
  'catalog.price_labels',
  'catalog.quick_add',
  'catalog.sellable',
  'catalog.uom',
  'catalog.variants',
  'client.mobile_pos',
  'compliance.lpdp',
  'data.backup',
  'display.vitrina',
  'hardware.diagnostics',
  'hardware.print_templates',
  'integrations.accounting_export',
  'integrations.api',
  'integrations.catalog_import',
  'inventory.batches',
  'inventory.bom',
  'inventory.locations',
  'inventory.scale',
  'inventory.serials',
  'ledger.accounts_payable',
  'ledger.accounts_receivable',
  'ledger.chart_of_accounts',
  'ledger.credit_limit_cents',
  'ledger.store_credit',
  'loyalty.points',
  'marketing.claim_gate',
  'marketing.compare',
  'marketing.content',
  'marketing.referrals',
  'marketing.site',
  'marketing.vertical_landing',
  'messaging.whatsapp_receipt',
  'mobile.push',
  'onboarding.tour',
  'ops.shift_handoff',
  'ops.team_invite',
  'orders.customer_orders',
  'orders.kds',
  'orders.lifecycle',
  'orders.split_bill',
  'owner.mode',
  'owner.offline_rollup',
  'owner.push_alerts',
  'payments.card_acquirer',
  'payments.qr_wallets',
  'platform.dr',
  'pos.brand_qr',
  'pos.checkout',
  'pos.document_selector',
  'pos.offline_correlative_reserve',
  'pricing.lists',
  'pricing.promotions',
  'purchasing.orders',
  'purchasing.partial_receive',
  'purchasing.returns',
  'purchasing.three_way',
  'reporting.catalog',
  'reporting.daily_rollups',
  'reporting.export',
  'reporting.product_rollups',
  'reporting.shard_aggregator',
  'sales.commissions',
  'sales.installments',
  'sales.layaway',
  'sales.quick_line',
  'sales.quotes',
  'sales.recurring',
  'sales.returns',
  'stock.transfers',
] as const;

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_CAPABILITIES);

export function isCanonicalCapability(cap: string): boolean {
  return CANONICAL_SET.has(cap);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function tenantNotFound(): HttpResult {
  return { status: 404, body: { error: 'Tenant not found', code: 'TENANT_NOT_FOUND' } };
}

function platformActorId(headers: Headers): string {
  // Derive actor from CF Access email or staff token indicator (no PII leak if token)
  const cfRaw =
    headers.get('cf-authorization') ??
    headers.get('cf_authorization') ??
    headers.get('cf-access-jwt-assertion') ??
    '';
  if (cfRaw) {
    const token = cfRaw.startsWith('Bearer ') ? cfRaw.slice(7).trim() : cfRaw.trim();
    const parts = token.split('.');
    if (parts.length === 3) {
      const part = parts[1] ?? '';
      try {
        const padded = part.replace(/-/g, '+').replace(/_/g, '/');
        const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
        const json = atob(padded + pad);
        const payload = JSON.parse(json) as Record<string, unknown>;
        const email =
          (payload.email as string) ??
          (payload.upn as string) ??
          (payload.preferred_username as string) ??
          '';
        if (typeof email === 'string' && email.trim())
          return `platform:${email.trim().toLowerCase()}`;
      } catch {
        // ignore
      }
    }
  }
  return 'platform:staff-token';
}

// -- validation helpers -----------------------------------------------------

function normalizeEnabled(
  value: unknown,
): { ok: true; enabledInt: 0 | 1 } | { ok: false; error: HttpResult } {
  if (value === 0 || value === 1) return { ok: true, enabledInt: value };
  if (value === true) return { ok: true, enabledInt: 1 };
  if (value === false) return { ok: true, enabledInt: 0 };
  // also accept "0" / "1" strings? Spec says 0/1 number; be strict but allow numeric string for robustness
  if (value === '0') return { ok: true, enabledInt: 0 };
  if (value === '1') return { ok: true, enabledInt: 1 };
  return {
    ok: false,
    error: { status: 400, body: { error: 'enabled must be 0 or 1', code: 'INVALID_ENABLED' } },
  };
}

function normalizeConfigJson(
  value: unknown,
): { ok: true; configJsonStr: string } | { ok: false; error: HttpResult } {
  if (value === undefined) return { ok: true, configJsonStr: '{}' };
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return { ok: true, configJsonStr: '{}' };
    try {
      JSON.parse(trimmed);
      return { ok: true, configJsonStr: trimmed };
    } catch {
      return {
        ok: false,
        error: {
          status: 400,
          body: { error: 'config_json must be valid JSON', code: 'INVALID_CONFIG_JSON' },
        },
      };
    }
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return { ok: true, configJsonStr: JSON.stringify(value) };
    } catch {
      return {
        ok: false,
        error: {
          status: 400,
          body: { error: 'config_json must be valid JSON', code: 'INVALID_CONFIG_JSON' },
        },
      };
    }
  }
  return {
    ok: false,
    error: {
      status: 400,
      body: { error: 'config_json must be valid JSON', code: 'INVALID_CONFIG_JSON' },
    },
  };
}

// -- PATCH ------------------------------------------------------------------

export async function runPatchTenantCapabilitiesHttp(
  env: PlatformAuthEnv,
  tenantId: string,
  body: Record<string, unknown>,
  requestHeaders: Headers,
): Promise<HttpResult> {
  if (!env.DB) return dbUnavailable();
  const tid = tenantId.trim();
  if (!tid) return { status: 400, body: { error: 'tenant id required', code: 'BAD_REQUEST' } };

  // Never trust body.tenant_id — path param is SoT (SEC-01).
  const capabilityRaw = body.capability;
  const capability = typeof capabilityRaw === 'string' ? capabilityRaw.trim() : '';
  if (!capability || !isCanonicalCapability(capability)) {
    return { status: 400, body: { error: 'Invalid capability', code: 'INVALID_CAPABILITY' } };
  }

  const enabledNorm = normalizeEnabled(body.enabled);
  if (!enabledNorm.ok) return enabledNorm.error;

  const configNorm = normalizeConfigJson(body.config_json);
  if (!configNorm.ok) return configNorm.error;

  // Validate tenant exists
  try {
    const tenant = await env.DB.prepare('SELECT id FROM tenants WHERE id = ?')
      .bind(tid)
      .first<{ id: string }>();
    if (!tenant) return tenantNotFound();
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }

  const enabledInt = enabledNorm.enabledInt;
  const configJsonStr = configNorm.configJsonStr;
  const actorId = platformActorId(requestHeaders);

  // Audit chain head (fail-closed 503 if unreadable)
  let prevHash: string | null = null;
  try {
    prevHash = await readAuditChainHead(env.DB, tid);
  } catch {
    return { status: 503, body: { error: 'Audit chain unavailable', code: 'AUDIT_UNAVAILABLE' } };
  }

  const payloadJson = JSON.stringify({
    capability,
    enabled: enabledInt,
    config_json: JSON.parse(configJsonStr),
    source: 'platform',
  });
  const rowHash = await sha256Hex(
    JSON.stringify({
      action: 'CAPABILITY_UPDATE',
      entity_id: capability,
      tenant_id: tid,
      capability,
      enabled: enabledInt,
      config_json: configJsonStr,
      prev: prevHash,
    }),
  );
  const auditId = crypto.randomUUID();

  // Build statements
  // NOTE: Using INSERT OR REPLACE (alias of REPLACE) to satisfy db.batch([REPLACE ...]) contract
  // while staying SQLite compatible. Avoid UPSERT INTO (V-22).
  const capStmt = env.DB.prepare(
    'INSERT OR REPLACE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) VALUES (?, ?, ?, ?)',
  ).bind(tid, capability, enabledInt, configJsonStr);

  const auditStmt = env.DB.prepare(
    `INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
     VALUES (?, ?, NULL, ?, 'CAPABILITY_UPDATE', 'tenant_capabilities', ?, ?, ?, ?)`,
  ).bind(auditId, tid, actorId, capability, payloadJson, prevHash, rowHash);

  const epochStmt = env.DB.prepare(
    'UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?',
  ).bind(tid);

  // Claim audit_chain_heads (CAS) — ensures append-only chain without fork
  let claimStmts: ReturnType<typeof auditChainClaimStatements> = [];
  try {
    claimStmts = auditChainClaimStatements(
      env.DB as unknown as Parameters<typeof auditChainClaimStatements>[0],
      tid,
      prevHash,
      [rowHash],
    );
  } catch {
    return { status: 503, body: { error: 'Audit chain claim failed', code: 'AUDIT_UNAVAILABLE' } };
  }

  try {
    const batchInputs: unknown[] = [capStmt, auditStmt, epochStmt, ...claimStmts];
    // D1 batch is atomic; triggers on tenant_capabilities will also bump epoch (0035)
    // so epoch increments twice (explicit + trigger). Acceptable per spec's explicit UPDATE.
    await env.DB.batch(batchInputs as D1PreparedStatement[]);
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }

  return {
    status: 200,
    body: {
      tenant_id: tid,
      capability,
      enabled: enabledInt,
      config_json: JSON.parse(configJsonStr),
      audit_id: auditId,
    },
  };
}

// -- GET /platform/tenants/:id/capabilities --------------------------------

export async function runGetTenantCapabilitiesHttp(
  env: PlatformAuthEnv,
  tenantId: string,
): Promise<HttpResult> {
  if (!env.DB) return dbUnavailable();
  const tid = tenantId.trim();
  if (!tid) return { status: 400, body: { error: 'tenant id required', code: 'BAD_REQUEST' } };

  try {
    const tenant = await env.DB.prepare('SELECT id FROM tenants WHERE id = ?')
      .bind(tid)
      .first<{ id: string }>();
    if (!tenant) return tenantNotFound();
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }

  try {
    const result = await env.DB.prepare(
      'SELECT capability, enabled, config_json FROM tenant_capabilities WHERE tenant_id = ? ORDER BY capability ASC',
    )
      .bind(tid)
      .all<{ capability: string; enabled: number; config_json: string }>();

    const capabilities = (result.results ?? []).map((r) => ({
      capability: String(r.capability),
      enabled: Number(r.enabled) === 1 ? 1 : 0,
      config_json: (() => {
        try {
          return JSON.parse(String(r.config_json ?? '{}'));
        } catch {
          return {};
        }
      })(),
    }));

    // Also return epoch for sync (consistent with GET /api/auth/session)
    let epoch: number | null = null;
    try {
      const row = await env.DB.prepare('SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?')
        .bind(tid)
        .first<{ epoch: number }>();
      epoch = typeof row?.epoch === 'number' ? row.epoch : 0;
    } catch {
      epoch = null;
    }

    return {
      status: 200,
      body: {
        tenant_id: tid,
        capabilities,
        ...(epoch !== null ? { epoch } : {}),
      },
    };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}

// -- GET /platform/tenants ---------------------------------------------------

export async function runListTenantsHttp(env: PlatformAuthEnv): Promise<HttpResult> {
  if (!env.DB) return dbUnavailable();
  try {
    const result = await env.DB.prepare(
      `SELECT id, plan_id, subscription_status, subscriptionStatus, status, is_active, trial_ends_at, created_at
       FROM tenants ORDER BY created_at DESC LIMIT 100`,
    ).all<{
      id: string;
      plan_id: string;
      subscription_status: string | null;
      subscriptionStatus: string | null;
      status: string | null;
      is_active: number | null;
      trial_ends_at: string | null;
      created_at: string | null;
    }>();

    const tenants = (result.results ?? []).map((r) => {
      const planId = r.plan_id ?? 'arranque';
      const subscriptionStatus = r.subscription_status ?? r.subscriptionStatus ?? 'active';
      const statusRaw = r.status ?? (r.is_active ? 'active' : 'suspended');
      const status = statusRaw === 'active' ? 'active' : 'suspended';
      return {
        id: String(r.id),
        plan_id: String(planId),
        subscriptionStatus: String(subscriptionStatus),
        subscription_status: String(subscriptionStatus),
        status: String(status),
        trial_ends_at: r.trial_ends_at ?? null,
        trialEndsAt: r.trial_ends_at ?? null,
        created_at: r.created_at ?? null,
      };
    });

    return { status: 200, body: { tenants } };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}
