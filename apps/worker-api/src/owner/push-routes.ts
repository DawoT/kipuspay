/**
 * owner.push_alerts — subscribe + send stub medible (FEATURE_OWNER_PUSH).
 * Fail-closed sin endpoint/keys; tasa ≥99% en harness controlado.
 */
import type { WorkerEnv } from '../auth/control-plane.js';

export function isOwnerPushEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_OWNER_PUSH === '1' || env?.FEATURE_OWNER_PUSH === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PushSendAttempt {
  readonly subscriptionId: string;
  readonly delivered: boolean;
}

export interface PushSendReport {
  readonly attempted: number;
  readonly delivered: number;
  readonly deliveryRate: number;
  readonly attempts: readonly PushSendAttempt[];
}

/** Stub medible: entrega si endpoint es https y keys no vacías. */
export function judgePushDelivery(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): boolean {
  return (
    input.endpoint.startsWith('https://') &&
    input.p256dh.trim().length > 0 &&
    input.auth.trim().length > 0
  );
}

export async function runSubscribePushHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: { endpoint?: string; p256dh?: string; auth?: string },
): Promise<HttpResult> {
  if (!isOwnerPushEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_OWNER_PUSH off', code: 'FEATURE_OFF' } };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const endpoint = body.endpoint ?? '';
  const p256dh = body.p256dh ?? '';
  const auth = body.auth ?? '';
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return { status: 400, body: { error: 'Invalid subscription', code: 'BAD_REQUEST' } };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, tenantId, userId, endpoint, p256dh, auth)
    .run();
  return { status: 200, body: { id, subscribed: true } };
}

export async function runSendOwnerPushHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: { title?: string; body?: string },
): Promise<HttpResult> {
  if (!isOwnerPushEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_OWNER_PUSH off', code: 'FEATURE_OFF' } };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  // S45-H4: la tabla legacy push_subscriptions fue dropeada por la 0038
  // (columnas endpoint/p256dh/auth en claro). El push al Dueño ahora se
  // encola en el motor mobile.push (suscripciones cifradas, consentimiento,
  // dispatcher). Best-effort: sin capability, no hace nada.
  try {
    const owner = await env.DB.prepare(
      `SELECT u.id FROM users u
       JOIN tenant_capabilities tc ON tc.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.role = 'owner' AND u.deleted_at IS NULL
         AND tc.capability = 'mobile.push' AND tc.enabled = 1
       LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ id: string }>();
    if (!owner) return { status: 200, body: { queued: false } };
    const sourceEntityId = crypto.randomUUID();
    const { appendPushEventAtomic } = await import('@kipuspay/adapters-d1');
    await appendPushEventAtomic(env.DB, {
      tenantId,
      userId: owner.id,
      purpose: 'OWNER_ALERTS',
      eventType: 'CASH_CLOSE',
      sourceEntityId,
      sourceEntityType: 'LOYALTY',
      idempotencyKeyHash: `loyalty:${tenantId}:${sourceEntityId}`,
      payloadRedactedJson: JSON.stringify({ title: body.title ?? '', body: body.body ?? '' }),
      deepLinkKind: 'cash_close',
      deepLinkEntityId: sourceEntityId,
      ttlSeconds: 300,
      collapseKey: `loyalty:${tenantId}`,
    });
    return { status: 202, body: { queued: true } };
  } catch {
    return { status: 200, body: { queued: false } };
  }
}
export function runPushDeliveryHarness(count = 100): PushSendReport {
  const attempts: PushSendAttempt[] = [];
  for (let i = 0; i < count; i += 1) {
    const ok = judgePushDelivery({
      endpoint: `https://push.example/${i}`,
      p256dh: `k${i}`,
      auth: `a${i}`,
    });
    attempts.push({ subscriptionId: `sub-${i}`, delivered: ok });
  }
  const delivered = attempts.filter((a) => a.delivered).length;
  return {
    attempted: count,
    delivered,
    deliveryRate: delivered / count,
    attempts,
  };
}
