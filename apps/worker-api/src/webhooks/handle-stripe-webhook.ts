import { extractStripePriceId, resolvePlanFromExtracted } from '@kipuspay/domain-billing';
import {
  MAX_WEBHOOK_BODY_BYTES,
  type StripeSignatureFailureCode,
  verifyStripeSignature,
  webhookBodyBytes,
} from './verify-stripe-signature.js';
import {
  isCasConflict,
  PLAN_RECONCILE_CONFLICT,
  reconcilePlanAtomic,
} from '../tenant/plan-reconcile.js';

const SUBSCRIPTION_TYPES = new Set([
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'invoice.payment_failed',
  'invoice.paid',
]);

const EXTERNAL_TENANT_ID = 'external';

// Estados no-pagadores de Stripe: fail-closed → revocar (SEC-08).
const NON_PAYING_STATUSES = new Set(['canceled', 'unpaid', 'incomplete', 'incomplete_expired']);

export interface StripeWebhookEnv {
  readonly WEBHOOK_EVENTS_DB?: D1Database;
  readonly DB?: D1Database;
  readonly STRIPE_WEBHOOK_SECRET?: string;
  readonly FQDN?: string;
  readonly STRIPE_PRICE_ARRANQUE?: string;
  readonly STRIPE_PRICE_CRECE?: string;
  readonly STRIPE_PRICE_CADENA?: string;
  readonly TENANT_KV: {
    get(key: string): Promise<string | null>;
    put?(key: string, value: string): Promise<void>;
    delete?(key: string): Promise<void>;
  };
  readonly TENANT_STATE_DO: {
    idFromName(name: string): { toString(): string };
    get(id: { toString(): string }): {
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  };
}

export interface WebhookHttpResult {
  status: number;
  body: Record<string, unknown>;
}

interface ParsedStripeEvent {
  id?: string | undefined;
  type?: string | undefined;
  tenantId?: string | undefined;
  objectStatus?: string | undefined;
}

function webhookDb(env: StripeWebhookEnv): D1Database | null {
  return env.WEBHOOK_EVENTS_DB ?? env.DB ?? null;
}

function parseEvent(rawBody: string): ParsedStripeEvent {
  const event = JSON.parse(rawBody) as {
    id?: unknown;
    type?: unknown;
    data?: { object?: { metadata?: { tenant_id?: unknown }; status?: unknown } };
  };
  const tenantRaw = event.data?.object?.metadata?.tenant_id;
  const objectStatus = event.data?.object?.status;
  return {
    id: typeof event.id === 'string' ? event.id : undefined,
    type: typeof event.type === 'string' ? event.type : undefined,
    tenantId: typeof tenantRaw === 'string' ? tenantRaw : undefined,
    objectStatus: typeof objectStatus === 'string' ? objectStatus : undefined,
  };
}

/**
 * Estado de suscripción derivado del evento (SEC-08). `customer.subscription.updated`
 * NUNCA des-revoca ni sube de estado: Stripe no garantiza orden de entrega entre tipos
 * en retries, un `updated` tardío tras un `deleted` no debe restaurar acceso. Solo
 * `invoice.paid` des-revoca; un estado no-pagador en `updated` revoca (fail-closed).
 * Devuelve null = no-op.
 */
function statusForPayload(
  eventType: string,
  objectStatus: string | undefined,
): 'canceled' | 'past_due' | 'active' | null {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  if (eventType === 'invoice.paid') return 'active';
  if (eventType === 'invoice.payment_failed') return 'past_due';
  if (eventType === 'customer.subscription.updated') {
    if (objectStatus === undefined || objectStatus === 'active' || objectStatus === 'trialing') {
      return null;
    }
    if (objectStatus === 'past_due') return 'past_due';
    if (NON_PAYING_STATUSES.has(objectStatus)) return 'canceled';
    return null;
  }
  return null;
}

/**
 * SEC-08 dedup atómico: INSERT ... ON CONFLICT DO NOTHING (un solo statement, sin
 * SELECT→INSERT con TOCTOU). changes=1 → claim; changes=0 → re-entrega: PROCESSED → dedup,
 * PROCESSING/FAILED → re-claim con attempt_count+1.
 */
async function claimEvent(
  db: D1Database,
  eventId: string,
  tenantId: string,
): Promise<'deduplicated' | 'claimed'> {
  const inserted = await db
    .prepare(
      `INSERT INTO webhook_events (id, tenant_id, source, event_id, status, attempt_count)
       VALUES (?, ?, 'stripe', ?, 'PROCESSING', 1)
       ON CONFLICT (source, event_id) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), tenantId, eventId)
    .run();

  if ((inserted.meta?.changes ?? 0) === 1) return 'claimed';

  const prior = await db
    .prepare(`SELECT status FROM webhook_events WHERE source = 'stripe' AND event_id = ?`)
    .bind(eventId)
    .first<{ status: string }>();

  if (prior?.status === 'PROCESSED') return 'deduplicated';

  await db
    .prepare(
      `UPDATE webhook_events SET status = 'PROCESSING', attempt_count = attempt_count + 1,
       last_error = NULL WHERE source = 'stripe' AND event_id = ?`,
    )
    .bind(eventId)
    .run();
  return 'claimed';
}

async function markProcessed(db: D1Database, eventId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE webhook_events SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP
       WHERE source = 'stripe' AND event_id = ?`,
    )
    .bind(eventId)
    .run();
}

async function markFailed(db: D1Database, eventId: string, error: string): Promise<void> {
  await db
    .prepare(
      `UPDATE webhook_events SET status = 'FAILED', last_error = ?
       WHERE source = 'stripe' AND event_id = ?`,
    )
    .bind(error, eventId)
    .run();
}

async function postTenantState(
  env: StripeWebhookEnv,
  tenantId: string,
  path: '/revoke' | '/unrevoke',
): Promise<void> {
  const fqdn = env.FQDN ?? 'https://tenant-state.local';
  const id = env.TENANT_STATE_DO.idFromName(tenantId);
  const stub = env.TENANT_STATE_DO.get(id);
  const res = await stub.fetch(new Request(new URL(path, fqdn), { method: 'POST' }));
  if (!res.ok) throw new Error(`TENANT_STATE_${path.slice(1).toUpperCase()}_FAILED`);
}

async function syncTenantSubscriptionStatus(
  env: StripeWebhookEnv,
  tenantId: string,
  status: 'canceled' | 'past_due' | 'active',
): Promise<void> {
  const put = env.TENANT_KV.put?.bind(env.TENANT_KV);
  if (!put) throw new Error('TENANT_KV_MUTATORS_UNAVAILABLE');
  const tenantRaw = await env.TENANT_KV.get(`tenant:${tenantId}`);
  if (!tenantRaw) return;
  const tenant = JSON.parse(tenantRaw) as Record<string, unknown>;
  tenant.subscriptionStatus = status;
  await put(`tenant:${tenantId}`, JSON.stringify(tenant));
  const db = env.DB ?? env.WEBHOOK_EVENTS_DB;
  if (db) {
    await db
      .prepare('UPDATE tenants SET subscription_status = ? WHERE id = ?')
      .bind(status, tenantId)
      .run();
  }
}

async function applySubscriptionEffects(
  env: StripeWebhookEnv,
  tenantId: string,
  eventType: string,
  objectStatus: string | undefined,
): Promise<void> {
  const put = env.TENANT_KV.put?.bind(env.TENANT_KV);
  const del = env.TENANT_KV.delete?.bind(env.TENANT_KV);
  if (!put || !del) throw new Error('TENANT_KV_MUTATORS_UNAVAILABLE');

  const status = statusForPayload(eventType, objectStatus);

  if (status === 'canceled') {
    await postTenantState(env, tenantId, '/revoke');
    await put(`revocation:${tenantId}`, '1');
  } else if (status === 'active') {
    // Única vía de des-revocación: invoice.paid. Un `updated` no restaura acceso.
    await postTenantState(env, tenantId, '/unrevoke');
    await del(`revocation:${tenantId}`);
  }
  // past_due: gracia GTM §4.3, sin revoke DO. null: no-op (updated activo/trial/desconocido).
  if (status !== null) {
    await syncTenantSubscriptionStatus(env, tenantId, status);
  }
}

function extractPlanFromRawBody(rawBody: string, env: StripeWebhookEnv): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { data?: { object?: unknown } };
    const obj = parsed.data?.object;
    if (!obj) return null;
    const extracted = extractStripePriceId(obj);
    const plan = resolvePlanFromExtracted(extracted, env);
    return plan;
  } catch {
    return null;
  }
}

async function maybeReconcilePlanFromStripe(
  env: StripeWebhookEnv,
  tenantId: string,
  rawBody: string,
): Promise<void> {
  const plan = extractPlanFromRawBody(rawBody, env);
  if (!plan) return;
  const db = webhookDb(env);
  if (!db) return;
  // reconcilePlanAtomic es idempotente: noop si ya está en plan
  let res: Awaited<ReturnType<typeof reconcilePlanAtomic>>;
  try {
    res = await reconcilePlanAtomic(env, tenantId, plan, {
      actorUserId: 'stripe-webhook',
      source: 'stripe_webhook',
    });
  } catch (e) {
    if (
      (e instanceof Error && (e as { code?: string }).code === PLAN_RECONCILE_CONFLICT) ||
      (e instanceof Error && e.message === PLAN_RECONCILE_CONFLICT) ||
      isCasConflict(e)
    ) {
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`PLAN_RECONCILE_FAILED:${plan}`, { cause: e as Error });
    }
    throw e;
  }
  if (res.status === 'error' || res.status === 'conflict') {
    // No silenciamos: el webhook debe reintentar (503)
    throw new Error(`PLAN_RECONCILE_FAILED:${plan}`);
  }
  // noop / updated / not_found son no-error para el webhook (tenant missing es edge de provisioning)
}

function validateWebhookRequest(
  env: StripeWebhookEnv | undefined,
  signatureHeader: string | undefined,
): WebhookHttpResult | { env: StripeWebhookEnv; secret: string; signatureHeader: string } {
  const secret = env?.STRIPE_WEBHOOK_SECRET;
  if (!env || !signatureHeader || !secret) {
    return {
      status: 400,
      body: {
        error: 'Webhook signature verification failed: Missing headers/secrets',
        code: 'MISSING_HEADER',
      },
    };
  }
  return { env, secret, signatureHeader };
}

function parseAndValidateEvent(rawBody: string): WebhookHttpResult | ParsedStripeEvent {
  let parsed: ParsedStripeEvent;
  try {
    parsed = parseEvent(rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }
  if (!parsed.id) return { status: 400, body: { error: 'Missing Stripe event id' } };
  const isSubscriptionEvent = parsed.type !== undefined && SUBSCRIPTION_TYPES.has(parsed.type);
  if (isSubscriptionEvent && !parsed.tenantId) {
    return { status: 400, body: { error: 'Missing tenant_id in metadata' } };
  }
  return parsed;
}

async function runWebhookEffects(
  env: StripeWebhookEnv,
  db: D1Database,
  event: ParsedStripeEvent,
  rawBody: string,
): Promise<WebhookHttpResult> {
  const eventId = event.id!;
  const claim = await claimEvent(db, eventId, event.tenantId ?? EXTERNAL_TENANT_ID);
  if (claim === 'deduplicated') {
    return { status: 200, body: { received: true, deduplicated: true } };
  }

  const isSubscriptionEvent = event.type !== undefined && SUBSCRIPTION_TYPES.has(event.type);
  try {
    if (isSubscriptionEvent && event.tenantId && event.type) {
      await applySubscriptionEffects(env, event.tenantId, event.type, event.objectStatus);
      // Ola 4: si el evento trae price → plan, reconcilia capabilities (idempotente)
      await maybeReconcilePlanFromStripe(env, event.tenantId, rawBody);
    }
    // Incluso eventos non-subscription pueden traer plan (invoice lines), reconcilia si hay tenant
    if (!isSubscriptionEvent && event.tenantId) {
      await maybeReconcilePlanFromStripe(env, event.tenantId, rawBody);
    }
    await markProcessed(db, eventId);
  } catch (error) {
    await markFailed(db, eventId, String(error));
    return {
      status: 503,
      body: { error: 'Webhook effect failed; retryable', code: 'WEBHOOK_RETRYABLE' },
    };
  }
  return { status: 200, body: { received: true } };
}

/**
 * Mensajes estables por clase de fallo de firma (US-02 / US-06): `error` texto
 * fijo + `code` estable por clase — los clientes clasifican por `code`, nunca
 * por texto ni por un 401/400 genérico.
 */
const STRIPE_SIGNATURE_ERROR_MESSAGES: Record<StripeSignatureFailureCode, string> = {
  MISSING_HEADER: 'Webhook signature verification failed: Missing headers/secrets',
  TIMESTAMP_EXPIRED: 'Stripe signature timestamp is outside the anti-replay window',
  TIMESTAMP_FUTURE: 'Stripe signature timestamp is in the future',
  INVALID_SIGNATURE: 'Invalid Stripe signature',
};

/**
 * Pipeline Stripe webhook: firma → dedup SEC-08 → efectos KV/DO (Arquitectura §4).
 */
export async function handleStripeWebhook(
  env: StripeWebhookEnv | undefined,
  rawBody: string,
  signatureHeader: string | undefined,
  nowMs: number = Date.now(),
): Promise<WebhookHttpResult> {
  // Size gate PREVIO a firma HMAC y JSON.parse (Invarian 6 / SEC-08): un body
  // >1MB se descarta sin trabajo criptográfico ni de parseo (anti-DoS).
  if (webhookBodyBytes(rawBody) > MAX_WEBHOOK_BODY_BYTES) {
    return {
      status: 413,
      body: { error: 'Webhook body too large', code: 'PAYLOAD_TOO_LARGE' },
    };
  }

  const gate = validateWebhookRequest(env, signatureHeader);
  if ('status' in gate) return gate;

  const verification = await verifyStripeSignature(
    rawBody,
    gate.signatureHeader,
    gate.secret,
    nowMs,
  );
  if (!verification.ok) {
    // US-02 / US-06: error.code estable por clase — nunca un 401/400 genérico
    // sin code. MISSING_HEADER no debería llegar aquí (el gate ya lo filtró),
    // pero si llega responde 400; el resto son fallos de firma → 401.
    return {
      status: verification.code === 'MISSING_HEADER' ? 400 : 401,
      body: {
        error: STRIPE_SIGNATURE_ERROR_MESSAGES[verification.code],
        code: verification.code,
      },
    };
  }

  const event = parseAndValidateEvent(rawBody);
  if ('status' in event) return event;

  const db = webhookDb(gate.env);
  if (!db) {
    return { status: 503, body: { error: 'Webhook store unavailable', code: 'WEBHOOK_RETRYABLE' } };
  }

  return runWebhookEffects(gate.env, db, event, rawBody);
}
