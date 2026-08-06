/**
 * Sprint 23 — cola de webhooks salientes (UNIQUE endpoint+event; retries).
 */
import {
  computeNextAttemptAtMs,
  shouldDisableWebhookEndpoint,
  WEBHOOK_MAX_ATTEMPTS,
  type PublicApiEventType,
  type WebhookDeliveryStatus,
} from '@kipuspay/domain-integrations';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface EnqueueWebhookDeliveryInput {
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventType: PublicApiEventType;
  readonly payloadJson: string;
}

export async function enqueueWebhookDeliveryAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: EnqueueWebhookDeliveryInput,
): Promise<{ readonly id: string; readonly idempotent: boolean }> {
  const existing = await db
    .prepare(
      `SELECT id FROM webhook_deliveries
       WHERE endpoint_id = ? AND event_id = ? LIMIT 1`,
    )
    .bind(input.endpointId, input.eventId)
    .first<{ id: string }>();
  if (existing) {
    return { id: existing.id, idempotent: true };
  }

  const id = crypto.randomUUID();
  const results = await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO webhook_deliveries (
             id, tenant_id, endpoint_id, event_id, event_type, payload_json, status, attempt_count
           )
           SELECT ?, ?, ?, ?, ?, ?, 'PENDING', 0
           WHERE NOT EXISTS (
             SELECT 1 FROM webhook_deliveries
             WHERE endpoint_id = ? AND event_id = ?
           )`,
        )
        .bind(
          id,
          tenantId,
          input.endpointId,
          input.eventId,
          input.eventType,
          input.payloadJson,
          input.endpointId,
          input.eventId,
        ),
    );
  });
  const changes = results[1]?.meta?.changes;
  const inserted = Array.isArray(changes) ? Number(changes[0] ?? 0) > 0 : true;
  if (inserted) return { id, idempotent: false };

  const winner = await db
    .prepare(
      `SELECT id FROM webhook_deliveries
       WHERE endpoint_id = ? AND event_id = ? LIMIT 1`,
    )
    .bind(input.endpointId, input.eventId)
    .first<{ id: string }>();
  if (winner) return { id: winner.id, idempotent: true };
  throw new Error('WEBHOOK_ENQUEUE_FAILED');
}

export async function claimWebhookDeliveryAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  deliveryId: string,
): Promise<{ readonly ok: boolean; readonly attemptCount: number }> {
  const row = await db
    .prepare(
      `SELECT status, attempt_count FROM webhook_deliveries
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(deliveryId, tenantId)
    .first<{ status: WebhookDeliveryStatus; attempt_count: number }>();
  if (!row || (row.status !== 'PENDING' && row.status !== 'FAILED')) {
    return { ok: false, attemptCount: row?.attempt_count ?? 0 };
  }
  const nextAttempt = row.attempt_count + 1;
  try {
    await runD1AtomicPlan(db, (plan) => {
      plan.guardState(
        `SELECT 1 FROM webhook_deliveries
         WHERE id = ? AND tenant_id = ? AND status IN ('PENDING','FAILED')`,
        [deliveryId, tenantId],
      );
      plan.add(
        db
          .prepare(
            `UPDATE webhook_deliveries
             SET status = 'PROCESSING', attempt_count = ?
             WHERE id = ? AND tenant_id = ? AND status IN ('PENDING','FAILED')`,
          )
          .bind(nextAttempt, deliveryId, tenantId),
      );
    });
    return { ok: true, attemptCount: nextAttempt };
  } catch {
    // GuardState abortó: otra instancia ya lo reclamó → no es nuestro.
    return { ok: false, attemptCount: row.attempt_count };
  }
}

export async function settleWebhookDeliveryAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: {
    readonly deliveryId: string;
    readonly endpointId: string;
    readonly success: boolean;
    readonly attemptCount: number;
    readonly error?: string | null;
    readonly nowMs: number;
    readonly endpointFailureCount: number;
  },
): Promise<{ readonly status: WebhookDeliveryStatus; readonly endpointDisabled: boolean }> {
  if (input.success) {
    await runD1AtomicPlan(db, (plan) => {
      plan.add(
        db
          .prepare(
            `UPDATE webhook_deliveries
             SET status = 'DELIVERED', delivered_at = datetime('now'), last_error = NULL
             WHERE id = ? AND tenant_id = ?`,
          )
          .bind(input.deliveryId, tenantId),
      );
      plan.add(
        db
          .prepare(
            `UPDATE webhook_endpoints
             SET failure_count = 0, last_failure_at = NULL
             WHERE id = ? AND tenant_id = ?`,
          )
          .bind(input.endpointId, tenantId),
      );
    });
    return { status: 'DELIVERED', endpointDisabled: false };
  }

  const exhausted = input.attemptCount >= WEBHOOK_MAX_ATTEMPTS;
  const nextFailures = input.endpointFailureCount + 1;
  const disable = shouldDisableWebhookEndpoint(nextFailures);
  const nextStatus: WebhookDeliveryStatus = exhausted || disable ? 'FAILED' : 'PENDING';
  const nextAt = new Date(computeNextAttemptAtMs(input.nowMs, input.attemptCount)).toISOString();

  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = ?, last_error = ?, next_attempt_at = ?
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(nextStatus, input.error ?? 'DELIVERY_FAILED', nextAt, input.deliveryId, tenantId),
    );
    plan.add(
      db
        .prepare(
          `UPDATE webhook_endpoints
           SET failure_count = ?, last_failure_at = datetime('now'),
               status = CASE WHEN ? = 1 THEN 'disabled' ELSE status END
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(nextFailures, disable ? 1 : 0, input.endpointId, tenantId),
    );
  });
  return { status: nextStatus, endpointDisabled: disable };
}
