/**
 * S9-A3 — recordatorios progresivos de pago (GTM §4.3 anti-apagado).
 * Mientras el tenant esté past_due y dentro del periodo de gracia, emite un
 * push BILLING_REMINDER diario (máximo 3, días 1..3). La caja nunca se
 * bloquea: el recordatorio es solo aviso. Idempotente por tenant+día
 * (idempotency_key_hash sobre appendPushEventAtomic).
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface BillingRemindersEnv {
  readonly DB?: D1Database;
  readonly FEATURE_BILLING_USAGE_OVERAGE?: string;
}

const MAX_REMINDERS = 3;
const LOOKBACK_DAYS = 3;

export function reminderDayFor(remindersInWindow: number, max = MAX_REMINDERS): number | null {
  if (remindersInWindow >= max) return null;
  return remindersInWindow + 1;
}

export async function runBillingRemindersScheduled(
  env: BillingRemindersEnv,
  input: { nowMs?: number },
): Promise<{ remindersEmitted: number; tenantsScanned: number }> {
  if (!env?.DB) return { remindersEmitted: 0, tenantsScanned: 0 };
  const nowMs = input.nowMs ?? Date.now();
  const dayKey = new Date(nowMs).toISOString().slice(0, 10);

  const rows = await env.DB.prepare(
    `SELECT tenant_id FROM tenants
     WHERE subscription_status = 'past_due' AND deleted_at IS NULL`,
  )
    .all<{ tenant_id: string }>()
    .catch(() => ({ results: [] as { tenant_id: string }[] }));

  let emitted = 0;
  for (const row of rows.results ?? []) {
    const tenantId = row.tenant_id;
    const existing = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM push_events
       WHERE tenant_id = ? AND event_type = 'BILLING_REMINDER'
         AND created_at >= datetime('now', '-${LOOKBACK_DAYS} days')`,
    )
      .bind(tenantId)
      .first<{ n: number }>()
      .catch(() => null);
    const count = existing?.n ?? 0;
    const day = reminderDayFor(count);
    if (!day) continue;

    const owner = await env.DB.prepare(
      `SELECT u.id FROM users u
       JOIN tenant_capabilities tc ON tc.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.role = 'owner' AND u.deleted_at IS NULL
         AND tc.capability = 'mobile.push' AND tc.enabled = 1
       LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ id: string }>()
      .catch(() => null);
    if (!owner) continue;

    try {
      const { appendPushEventAtomic } = await import('@kipuspay/adapters-d1');
      const sourceEntityId = `billing:${tenantId}:${dayKey}:day${day}`;
      await appendPushEventAtomic(env.DB, {
        tenantId,
        userId: owner.id,
        purpose: 'OWNER_ALERTS',
        eventType: 'BILLING_REMINDER',
        sourceEntityId,
        sourceEntityType: 'BILLING',
        idempotencyKeyHash: `billing:${tenantId}:${dayKey}:day${day}`,
        payloadRedactedJson: JSON.stringify({
          day,
          message:
            day === 1
              ? 'Actualiza tu método de pago: la caja sigue operando con normalidad.'
              : day === 2
                ? 'Te recordamos regularizar tu pago. La caja sigue operando; las herramientas de gestión se pausarán tras el día 3.'
                : 'Último recordatorio: regulariza tu pago hoy. La caja sigue operando; mañana se pausan las herramientas de gestión.',
        }),
        deepLinkKind: 'billing_reminder',
        deepLinkEntityId: tenantId,
        ttlSeconds: 604800,
        collapseKey: `billing:${tenantId}`,
      });
      emitted += 1;
    } catch {
      // Best-effort: un fallo de push no debe tumbar el cron.
    }
  }
  return { remindersEmitted: emitted, tenantsScanned: rows.results?.length ?? 0 };
}
