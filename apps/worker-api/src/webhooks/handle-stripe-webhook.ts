import { verifyStripeSignature } from './verify-stripe-signature.js';

const SUBSCRIPTION_TYPES = new Set([
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'invoice.payment_failed',
  'invoice.paid',
]);

export interface StripeWebhookEnv {
  readonly WEBHOOK_EVENTS_DB?: D1Database;
  readonly DB?: D1Database;
  readonly STRIPE_WEBHOOK_SECRET?: string;
  readonly FQDN?: string;
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

interface PriorEvent {
  id: string;
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED';
}

interface ParsedStripeEvent {
  id?: string | undefined;
  type?: string | undefined;
  tenantId?: string | undefined;
}

function webhookDb(env: StripeWebhookEnv): D1Database | null {
  return env.WEBHOOK_EVENTS_DB ?? env.DB ?? null;
}

function parseEvent(rawBody: string): ParsedStripeEvent {
  const event = JSON.parse(rawBody) as {
    id?: unknown;
    type?: unknown;
    data?: { object?: { metadata?: { tenant_id?: unknown } } };
  };
  const tenantRaw = event.data?.object?.metadata?.tenant_id;
  return {
    id: typeof event.id === 'string' ? event.id : undefined,
    type: typeof event.type === 'string' ? event.type : undefined,
    tenantId: typeof tenantRaw === 'string' ? tenantRaw : undefined,
  };
}

function subscriptionStatusFor(eventType: string): 'canceled' | 'past_due' | 'active' {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  if (eventType === 'invoice.payment_failed') return 'past_due';
  return 'active';
}

async function claimEvent(
  db: D1Database,
  eventId: string,
  tenantId: string,
): Promise<'deduplicated' | 'claimed'> {
  const prior = await db
    .prepare(`SELECT id, status FROM webhook_events WHERE source = 'stripe' AND event_id = ?`)
    .bind(eventId)
    .first<PriorEvent>();

  if (prior?.status === 'PROCESSED') return 'deduplicated';

  if (prior) {
    await db
      .prepare(
        `UPDATE webhook_events SET status = 'PROCESSING', attempt_count = attempt_count + 1,
         last_error = NULL WHERE id = ?`,
      )
      .bind(prior.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO webhook_events (id, tenant_id, source, event_id, status, attempt_count)
       VALUES (?, ?, 'stripe', ?, 'PROCESSING', 1)`,
      )
      .bind(crypto.randomUUID(), tenantId, eventId)
      .run();
  }
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
  eventType: string,
): Promise<void> {
  const put = env.TENANT_KV.put?.bind(env.TENANT_KV);
  if (!put) throw new Error('TENANT_KV_MUTATORS_UNAVAILABLE');
  const tenantRaw = await env.TENANT_KV.get(`tenant:${tenantId}`);
  if (!tenantRaw) return;
  const tenant = JSON.parse(tenantRaw) as Record<string, unknown>;
  tenant.subscriptionStatus = subscriptionStatusFor(eventType);
  await put(`tenant:${tenantId}`, JSON.stringify(tenant));
}

async function applySubscriptionEffects(
  env: StripeWebhookEnv,
  tenantId: string,
  eventType: string,
): Promise<void> {
  const put = env.TENANT_KV.put?.bind(env.TENANT_KV);
  const del = env.TENANT_KV.delete?.bind(env.TENANT_KV);
  if (!put || !del) throw new Error('TENANT_KV_MUTATORS_UNAVAILABLE');

  if (eventType === 'customer.subscription.deleted') {
    await postTenantState(env, tenantId, '/revoke');
    await put(`revocation:${tenantId}`, '1');
  } else if (eventType === 'invoice.paid' || eventType === 'customer.subscription.updated') {
    await postTenantState(env, tenantId, '/unrevoke');
    await del(`revocation:${tenantId}`);
  }
  // invoice.payment_failed: past_due en KV sin revoke DO (gracia GTM §4.3)
  await syncTenantSubscriptionStatus(env, tenantId, eventType);
}

function validateWebhookRequest(
  env: StripeWebhookEnv | undefined,
  signatureHeader: string | undefined,
): WebhookHttpResult | { env: StripeWebhookEnv; secret: string; signatureHeader: string } {
  const secret = env?.STRIPE_WEBHOOK_SECRET;
  if (!env || !signatureHeader || !secret) {
    return {
      status: 400,
      body: { error: 'Webhook signature verification failed: Missing headers/secrets' },
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
): Promise<WebhookHttpResult> {
  const eventId = event.id!;
  const claim = await claimEvent(db, eventId, event.tenantId ?? 'system');
  if (claim === 'deduplicated') {
    return { status: 200, body: { received: true, deduplicated: true } };
  }

  const isSubscriptionEvent = event.type !== undefined && SUBSCRIPTION_TYPES.has(event.type);
  try {
    if (isSubscriptionEvent && event.tenantId && event.type) {
      await applySubscriptionEffects(env, event.tenantId, event.type);
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
 * Pipeline Stripe webhook: firma → dedup SEC-08 → efectos KV/DO (Arquitectura §4).
 */
export async function handleStripeWebhook(
  env: StripeWebhookEnv | undefined,
  rawBody: string,
  signatureHeader: string | undefined,
  nowMs: number = Date.now(),
): Promise<WebhookHttpResult> {
  const gate = validateWebhookRequest(env, signatureHeader);
  if ('status' in gate) return gate;

  const isValid = await verifyStripeSignature(rawBody, gate.signatureHeader, gate.secret, nowMs);
  if (!isValid) {
    return { status: 401, body: { error: 'Invalid Stripe signature' } };
  }

  const event = parseAndValidateEvent(rawBody);
  if ('status' in event) return event;

  const db = webhookDb(gate.env);
  if (!db) {
    return { status: 503, body: { error: 'Webhook store unavailable', code: 'WEBHOOK_RETRYABLE' } };
  }

  return runWebhookEffects(gate.env, db, event);
}
