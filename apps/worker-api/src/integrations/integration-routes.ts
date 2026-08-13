/**
 * Sprint 23 — Contador export + API keys + webhooks salientes (§5.4 reglas 3–4).
 * Plan Guard Cadena+; cobro nunca 402.
 */
import {
  exportAccountingEntries,
  enqueueWebhookDeliveryAtomic,
  claimWebhookDeliveryAtomic,
  settleWebhookDeliveryAtomic,
} from '@kipuspay/adapters-d1';
import { formatAccountingExport } from '@kipuspay/adapters-accounting';
import {
  assertSafeWebhookUrl,
  hashApiKey,
  isAccountingExportTarget,
  isPublicApiEventType,
  kvApiKeyRevokedKey,
  parseApiKeyToken,
  signWebhookBody,
  verifyApiKey,
  type WebhookHostResolver,
  type PublicApiEventType,
} from '@kipuspay/domain-integrations';
import type { WorkerEnv } from '../auth/control-plane.js';
import { assertCadenaPlusPlan, isCadenaPlusPlan } from '../auth/plan-cadena.js';

export interface HttpResult {
  status: number;
  body: Record<string, unknown> | string;
  contentType?: string;
}

/** SEC-06: timeout del fetch saliente del webhook (ventana anti-replay ≤ 300 s). */
const WEBHOOK_TIMEOUT_MS = 15_000;

export function isAccountingExportEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_ACCOUNTING_EXPORT === '1' || env?.FEATURE_ACCOUNTING_EXPORT === 'true';
}

export function isIntegrationsApiEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_INTEGRATIONS_API === '1' || env?.FEATURE_INTEGRATIONS_API === 'true';
}

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function badRequest(reason: string): HttpResult {
  return { status: 400, body: { error: reason, code: 'BAD_REQUEST' } };
}

function mapErr(e: unknown): HttpResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 422, body: { error: msg, code: msg } };
}

/**
 * SEC-03: el pepper es requisito fail-closed. Sin `API_KEY_PEPPER` configurado
 * (o vacío) NO se usan pepper de desarrollo: devuelve null y el caller responde 503.
 */
function apiPepper(env: WorkerEnv): string | null {
  const pepper = env.API_KEY_PEPPER?.trim();
  return pepper ? pepper : null;
}

/** C7: operaciones de mantenimiento solo para rol admin/owner (nunca por omisión). */
function isAdminRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

function randomToken(bytes = 24): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function previousAuditHash(db: NonNullable<WorkerEnv['DB']>, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

export async function runAccountingExportHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId?: string,
): Promise<HttpResult> {
  if (!isAccountingExportEnabled(env)) return featureOff('FEATURE_ACCOUNTING_EXPORT');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const fromDate = typeof body.fromDate === 'string' ? body.fromDate : '';
  const toDate = typeof body.toDate === 'string' ? body.toDate : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const target = typeof body.target === 'string' ? body.target : '';
  if (!fromDate || !toDate || !branchId || !isAccountingExportTarget(target)) {
    return badRequest('fromDate, toDate, branchId, target(contasis|concar) requeridos');
  }

  try {
    const fromJournal =
      env.FEATURE_LEDGER_CHART_OF_ACCOUNTS === '1' ||
      env.FEATURE_LEDGER_CHART_OF_ACCOUNTS === 'true';
    const entries = await exportAccountingEntries(
      env.DB,
      tenantId,
      { fromDate, toDate, branchId },
      { fromJournal },
    );
    const formatted = formatAccountingExport(target, entries);

    // S23-H2: audit append-only de cada export (quién/cuándo/qué rango).
    if (actorUserId) {
      const payload = {
        fromDate,
        toDate,
        branchId,
        target,
        entriesCount: entries.length,
      };
      const rowHash = await sha256Hex(JSON.stringify(payload));
      const prevHash = await previousAuditHash(env.DB, tenantId);
      await env.DB.prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          tenantId,
          branchId,
          actorUserId,
          'ACCOUNTING_EXPORT',
          'accounting',
          `${target}:${fromDate}_${toDate}`,
          JSON.stringify(payload),
          prevHash,
          rowHash,
        )
        .run();
    }

    return {
      status: 200,
      body: formatted.body,
      contentType: formatted.contentType,
    };
  } catch (e) {
    return mapErr(e);
  }
}

export async function runCreateApiKeyHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  createdByUserId: string,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const token = `kp_live_${randomToken(20)}`;
  const { prefix } = parseApiKeyToken(token);
  const pepper = apiPepper(env);
  if (!pepper) {
    return {
      status: 503,
      body: { error: 'API key pepper not configured', code: 'PEPPER_UNAVAILABLE' },
    };
  }
  const { saltHex, hashHex } = await hashApiKey(token, pepper);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO api_keys (id, tenant_id, key_prefix, key_hash, status, created_by_user_id)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  )
    .bind(id, tenantId, prefix, `${saltHex}:${hashHex}`, createdByUserId || null)
    .run();

  return {
    status: 201,
    body: {
      id,
      prefix,
      apiKey: token,
      warning: 'Store apiKey now; it will not be shown again',
    },
  };
}

export async function runListApiKeysHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const rows = await env.DB.prepare(
    `SELECT id, key_prefix, status, last_used_at, created_at, revoked_at
     FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC`,
  )
    .bind(tenantId)
    .all();
  return { status: 200, body: { keys: rows.results ?? [] } };
}

export async function runRevokeApiKeyHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  keyId: string,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const row = await env.DB.prepare(
    `SELECT id, key_prefix FROM api_keys WHERE tenant_id = ? AND id = ? LIMIT 1`,
  )
    .bind(tenantId, keyId)
    .first<{ id: string; key_prefix: string }>();
  if (!row) return { status: 404, body: { error: 'API key not found', code: 'NOT_FOUND' } };

  await env.DB.prepare(
    `UPDATE api_keys SET status = 'revoked', revoked_at = datetime('now')
     WHERE tenant_id = ? AND id = ?`,
  )
    .bind(tenantId, keyId)
    .run();

  const kvKey = kvApiKeyRevokedKey(tenantId, row.key_prefix);
  await env.TENANT_KV.put?.(kvKey, '1');

  return { status: 200, body: { id: keyId, status: 'revoked' } };
}

/**
 * Resolución DNS-over-HTTPS (Web Platform `fetch`, 1.1.1.1 JSON API) para
 * el anti DNS-rebinding de SEC-04. Devuelve las IPs A/AAAA del hostname;
 * ante fallo de red devuelve [] (el deny-list estático sigue cubriendo).
 */
export const resolveWebhookHost: WebhookHostResolver = async (hostname) => {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: 'application/dns-json' } },
    );
    if (!res.ok) return [];
    const data: { Answer?: Array<{ type: number; data?: string }> } = await res.json();
    return (data.Answer ?? [])
      .filter(
        (a): a is { type: number; data: string } => a.type === 1 && typeof a.data === 'string',
      )
      .map((a) => a.data);
  } catch {
    return [];
  }
};

export async function runCreateWebhookEndpointHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  try {
    await assertSafeWebhookUrl(url, resolveWebhookHost);
  } catch (e) {
    return mapErr(e);
  }

  const events = Array.isArray(body.events)
    ? body.events.filter(
        (e): e is PublicApiEventType => typeof e === 'string' && isPublicApiEventType(e),
      )
    : [];
  if (events.length === 0)
    return badRequest('events requerido (sale.created|cpe.accepted|cpe.rejected)');

  const secret = `whsec_${randomToken(24)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
  const secretHash = await signWebhookBody(saltHex, secret);
  const id = crypto.randomUUID();
  const kmsRef = `kv:webhook_secret:${id}`;

  await env.DB.prepare(
    `INSERT INTO webhook_endpoints (
       id, tenant_id, url, secret_hash, secret_kms_ref, secret_salt, events_json, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
  )
    .bind(id, tenantId, url, secretHash, kmsRef, salt, JSON.stringify(events))
    .run();

  await env.TENANT_KV.put?.(kmsRef, secret);

  return {
    status: 201,
    body: {
      id,
      url,
      events,
      secret,
      warning: 'Store secret now; it will not be shown again',
    },
  };
}

export async function runListWebhookEndpointsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const rows = await env.DB.prepare(
    `SELECT id, url, events_json, status, failure_count, last_failure_at
     FROM webhook_endpoints WHERE tenant_id = ? ORDER BY id`,
  )
    .bind(tenantId)
    .all();
  return { status: 200, body: { endpoints: rows.results ?? [] } };
}

export async function runDeleteWebhookEndpointHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  endpointId: string,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const planDeny = await assertCadenaPlusPlan(env, tenantId);
  if (planDeny) return planDeny;

  const row = await env.DB.prepare(
    `SELECT id, secret_kms_ref FROM webhook_endpoints WHERE tenant_id = ? AND id = ? LIMIT 1`,
  )
    .bind(tenantId, endpointId)
    .first<{ id: string; secret_kms_ref: string }>();
  if (!row) return { status: 404, body: { error: 'endpoint not found', code: 'NOT_FOUND' } };

  await env.DB.prepare(`DELETE FROM webhook_deliveries WHERE tenant_id = ? AND endpoint_id = ?`)
    .bind(tenantId, endpointId)
    .run();
  await env.DB.prepare(`DELETE FROM webhook_endpoints WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, endpointId)
    .run();
  await env.TENANT_KV.delete?.(row.secret_kms_ref);

  return { status: 200, body: { id: endpointId, deleted: true } };
}

async function resolveApiKeyTenant(
  env: WorkerEnv,
  authorization: string | undefined,
): Promise<{ tenantId: string; keyId: string } | HttpResult> {
  if (!authorization?.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'Missing API key', code: 'UNAUTHENTICATED' } };
  }
  const token = authorization.slice('Bearer '.length).trim();
  let prefix: string;
  try {
    prefix = parseApiKeyToken(token).prefix;
  } catch {
    return { status: 401, body: { error: 'Invalid API key', code: 'UNAUTHENTICATED' } };
  }

  const pepper = apiPepper(env);
  if (!pepper) {
    return {
      status: 503,
      body: { error: 'API key pepper not configured', code: 'PEPPER_UNAVAILABLE' },
    };
  }

  // Hot-path revoke via KV (immediate).
  // S23-H1: excluir revocadas en SQL ANTES del LIMIT 20 — si las revocadas
  // llenan los primeros 20 candidatos de un prefijo compartido, la key activa
  // jamás se alcanza en el loop y el cliente recibe 401 falso.
  const candidates = await env
    .DB!.prepare(
      `SELECT id, tenant_id, key_prefix, key_hash, status FROM api_keys
       WHERE key_prefix = ? AND status = 'active' LIMIT 20`,
    )
    .bind(prefix)
    .all<{ id: string; tenant_id: string; key_prefix: string; key_hash: string; status: string }>();

  for (const row of candidates.results ?? []) {
    const revoked = await env.TENANT_KV.get(kvApiKeyRevokedKey(row.tenant_id, row.key_prefix));
    if (revoked === '1' || row.status === 'revoked') {
      continue;
    }
    const [saltHex, hashHex] = row.key_hash.split(':');
    if (!saltHex || !hashHex) continue;
    if (await verifyApiKey(token, pepper, saltHex, hashHex)) {
      const plan = await env
        .DB!.prepare(`SELECT plan_id FROM tenants WHERE id = ? LIMIT 1`)
        .bind(row.tenant_id)
        .first<{ plan_id: string }>();
      if (!plan || !isCadenaPlusPlan(plan.plan_id)) {
        return {
          status: 403,
          body: { error: 'Requires Cadena plan', code: 'PLAN_REQUIRES_CADENA' },
        };
      }
      await env
        .DB!.prepare(
          `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
        )
        .bind(row.id, row.tenant_id)
        .run();
      return { tenantId: row.tenant_id, keyId: row.id };
    }
  }
  return { status: 401, body: { error: 'Invalid or revoked API key', code: 'UNAUTHENTICATED' } };
}

export async function runPublicSalesListHttp(
  env: WorkerEnv | undefined,
  authorization: string | undefined,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const auth = await resolveApiKeyTenant(env, authorization);
  if ('status' in auth) return auth;

  const rows = await env.DB.prepare(
    `SELECT id, branch_id, document_type, series, number, total_amount_cents, issued_at_lima, sunat_status
     FROM sales WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY issued_at_lima DESC LIMIT 100`,
  )
    .bind(auth.tenantId)
    .all();
  return { status: 200, body: { sales: rows.results ?? [] } };
}

export async function runPublicDocumentsListHttp(
  env: WorkerEnv | undefined,
  authorization: string | undefined,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();
  const auth = await resolveApiKeyTenant(env, authorization);
  if ('status' in auth) return auth;

  const rows = await env.DB.prepare(
    `SELECT id, document_type, series, number, sunat_status, total_amount_cents, issued_at_lima
     FROM sales
     WHERE tenant_id = ? AND deleted_at IS NULL
       AND document_type IN ('01','03','07','08','12')
     ORDER BY issued_at_lima DESC LIMIT 100`,
  )
    .bind(auth.tenantId)
    .all();
  return { status: 200, body: { documents: rows.results ?? [] } };
}

export async function enqueuePublicEventForTenant(
  env: WorkerEnv,
  tenantId: string,
  eventType: PublicApiEventType,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isIntegrationsApiEnabled(env) || !env.DB) return;
  const endpoints = await env.DB.prepare(
    `SELECT id, events_json FROM webhook_endpoints
     WHERE tenant_id = ? AND status = 'active'`,
  )
    .bind(tenantId)
    .all<{ id: string; events_json: string }>();

  const payloadJson = JSON.stringify({
    id: eventId,
    type: eventType,
    created_at: new Date().toISOString(),
    data: payload,
  });

  for (const ep of endpoints.results ?? []) {
    try {
      const events = JSON.parse(ep.events_json) as string[];
      if (!events.includes(eventType)) continue;
    } catch {
      continue;
    }
    await enqueueWebhookDeliveryAtomic(env.DB, tenantId, {
      endpointId: ep.id,
      eventId: `${eventType}:${eventId}`,
      eventType,
      payloadJson,
    });
  }
}

interface WebhookDueRow {
  id: string;
  tenant_id: string;
  endpoint_id: string;
  payload_json: string;
  attempt_count: number;
  url: string;
  secret_kms_ref: string;
  failure_count: number;
}

async function processSingleWebhookDelivery(
  db: NonNullable<WorkerEnv['DB']>,
  kv: WorkerEnv['TENANT_KV'],
  row: WebhookDueRow,
): Promise<boolean> {
  const claimed = await claimWebhookDeliveryAtomic(db, row.tenant_id, row.id);
  if (!claimed.ok) return false;

  const secret = await kv.get(row.secret_kms_ref);
  if (!secret) {
    await settleWebhookDeliveryAtomic(db, row.tenant_id, {
      deliveryId: row.id,
      endpointId: row.endpoint_id,
      success: false,
      attemptCount: claimed.attemptCount,
      error: 'SECRET_MISSING',
      nowMs: Date.now(),
      endpointFailureCount: row.failure_count,
    });
    return false;
  }

  const signature = await signWebhookBody(secret, row.payload_json);
  let ok = false;
  let err: string | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);
    const res = await fetch(row.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-kipuspay-signature': signature,
      },
      body: row.payload_json,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    ok = res.ok;
    if (!ok) err = `HTTP_${res.status}`;
  } catch (e) {
    err = e instanceof Error ? e.message : 'FETCH_FAILED';
  }

  const settled = await settleWebhookDeliveryAtomic(db, row.tenant_id, {
    deliveryId: row.id,
    endpointId: row.endpoint_id,
    success: ok,
    attemptCount: claimed.attemptCount,
    error: err,
    nowMs: Date.now(),
    endpointFailureCount: row.failure_count,
  });

  return settled.status === 'DELIVERED';
}

export async function runDrainWebhookDeliveriesHttp(
  env: WorkerEnv | undefined,
  limit = 20,
  userId?: string,
  userRole?: string,
): Promise<HttpResult> {
  if (!isIntegrationsApiEnabled(env)) return featureOff('FEATURE_INTEGRATIONS_API');
  if (!env?.DB) return dbUnavailable();

  if (!userId || !isAdminRole(userRole)) {
    return { status: 403, body: { error: 'admin role required', code: 'FORBIDDEN_ADMIN' } };
  }

  const due = await env.DB.prepare(
    `SELECT d.id, d.tenant_id, d.endpoint_id, d.payload_json, d.attempt_count,
            e.url, e.secret_kms_ref, e.failure_count
     FROM webhook_deliveries d
     INNER JOIN webhook_endpoints e
       ON e.tenant_id = d.tenant_id AND e.id = d.endpoint_id
     WHERE d.status IN ('PENDING','FAILED')
       AND e.status = 'active'
       AND datetime(d.next_attempt_at) <= datetime('now')
     ORDER BY d.next_attempt_at ASC
     LIMIT ?`,
  )
    .bind(limit)
    .all<WebhookDueRow>();

  let delivered = 0;
  let failed = 0;
  for (const row of due.results ?? []) {
    const success = await processSingleWebhookDelivery(env.DB, env.TENANT_KV, row);
    if (success) delivered += 1;
    else failed += 1;
  }
  return { status: 200, body: { delivered, failed, scanned: due.results?.length ?? 0 } };
}
