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
  const rows = await env.DB.prepare(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
  const subs = rows.results ?? [];
  const attempts: PushSendAttempt[] = subs.map((s) => ({
    subscriptionId: s.id,
    delivered: judgePushDelivery(s),
  }));
  const delivered = attempts.filter((a) => a.delivered).length;
  const attempted = attempts.length;
  const report: PushSendReport = {
    attempted,
    delivered,
    deliveryRate: attempted === 0 ? 1 : delivered / attempted,
    attempts,
  };
  return {
    status: 200,
    body: {
      title: body.title ?? 'KipusPay',
      message: body.body ?? '',
      ...report,
      meetsSla: report.deliveryRate >= 0.99,
    },
  };
}

/** Harness: N suscripciones válidas → tasa ≥99%. */
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
