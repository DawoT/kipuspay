/**
 * owner.push_alerts — send best-effort vía motor mobile.push (FEATURE_OWNER_PUSH).
 * El subscribe legacy (endpoint/p256dh/auth en claro) murió con la 0038;
 * el contrato real es subscribePushDeviceHttp (mobile-push-routes).
 */
import type { WorkerEnv } from '../auth/control-plane.js';

export function isOwnerPushEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_OWNER_PUSH === '1' || env?.FEATURE_OWNER_PUSH === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
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
      // Risco 2 (F-02): cron */5 =300s; TTL 300 expira en el borde (e.expires_at > now
      // falla si cron despierta a los 300s). 360s da 60s de margen sin tocar cron.
      ttlSeconds: 360,
      collapseKey: `loyalty:${tenantId}`,
    });
    return { status: 202, body: { queued: true } };
  } catch {
    return { status: 200, body: { queued: false } };
  }
}
