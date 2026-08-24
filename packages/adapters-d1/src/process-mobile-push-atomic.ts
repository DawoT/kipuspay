import type { D1Bound, D1DatabaseLike, D1Prepared, D1Result } from './index.js';

type PushPurpose = 'OWNER_ALERTS' | 'OPERATIONAL_MOBILE';
type PushEventType =
  | 'CASH_CLOSE'
  | 'CASH_DISCREPANCY'
  | 'INVENTORY_STOCKOUT'
  | 'INSTALLMENT_OVERDUE'
  | 'ACCOUNTS_RECEIVABLE_OVERDUE'
  | 'CUSTOMER_ORDER_EXPIRY'
  | 'RECURRING_GRACE'
  | 'BILLING_REMINDER';

interface LooseD1Database {
  prepare(sql: string): D1Prepared | undefined;
  batch(statements: readonly D1Bound[]): Promise<readonly D1Result<unknown>[]>;
}

function statement(
  db: LooseD1Database,
  sql: string,
  params: readonly unknown[],
): D1Bound | undefined {
  return db.prepare(sql)?.bind(...params);
}

async function first<T>(
  db: LooseD1Database,
  sql: string,
  params: readonly unknown[],
): Promise<T | null> {
  const bound = statement(db, sql, params);
  return bound ? bound.first<T>() : null;
}

async function all<T>(
  db: LooseD1Database,
  sql: string,
  params: readonly unknown[],
): Promise<readonly T[]> {
  const bound = statement(db, sql, params);
  if (!bound) return [];
  return (await bound.all<T>()).results ?? [];
}

async function atomicBatch(
  db: LooseD1Database,
  statements: readonly (D1Bound | undefined)[],
): Promise<readonly D1Result<unknown>[]> {
  return db.batch(statements.filter((value): value is D1Bound => value !== undefined));
}

export async function appendPushEventAtomic(
  db: LooseD1Database,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly purpose: PushPurpose;
    readonly targetBranchId?: string;
    readonly eventType: PushEventType;
    readonly sourceEntityId: string;
    readonly sourceEntityType?: string;
    readonly idempotencyKeyHash: string;
    readonly payloadRedactedJson?: string;
    readonly amount_cents?: number | null;
    readonly deepLinkKind?: string;
    readonly deepLinkEntityId?: string;
    readonly ttlSeconds?: number;
    readonly collapseKey?: string;
    readonly now?: string;
  },
): Promise<{
  readonly queued: boolean;
  readonly alreadyApplied: boolean;
  readonly eventId: string;
}> {
  const replay = await first<{ id: string }>(
    db,
    `SELECT id FROM push_events
     WHERE tenant_id = ? AND idempotency_key_hash = ? LIMIT 1`,
    [input.tenantId, input.idempotencyKeyHash],
  );
  if (replay) return { queued: true, alreadyApplied: true, eventId: replay.id };

  const eventId = crypto.randomUUID();
  if (input.purpose === 'OPERATIONAL_MOBILE' && !input.targetBranchId) {
    throw new Error('PUSH_OPERATIONAL_TARGET_REQUIRED');
  }
  const now = input.now ?? new Date().toISOString();
  const ttlSeconds = Math.min(86_400, Math.max(1, input.ttlSeconds ?? 300));
  const expiresAt = new Date(Date.parse(now) + ttlSeconds * 1000).toISOString();
  const guardId = crypto.randomUUID();
  await atomicBatch(db, [
    statement(
      db,
      `INSERT INTO atomic_guards(id, ok)
       SELECT ?, CASE WHEN EXISTS (
         SELECT 1 FROM push_consents
         WHERE tenant_id = ? AND user_id = ? AND purpose = ? AND revoked_at IS NULL
       ) AND NOT EXISTS (
         SELECT 1 FROM push_events
         WHERE tenant_id = ? AND idempotency_key_hash = ?
       ) THEN 1 ELSE 0 END`,
      [
        guardId,
        input.tenantId,
        input.userId,
        input.purpose,
        input.tenantId,
        input.idempotencyKeyHash,
      ],
    ),
    statement(
      db,
      `INSERT INTO push_events (
         id, tenant_id, event_type, source_entity_type, source_entity_id,
         idempotency_key_hash, target_scope, target_user_id, target_branch_id,
         payload_redacted_json, amount_cents,
         deep_link_kind, deep_link_entity_id, ttl_seconds, collapse_key,
         created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        input.tenantId,
        input.eventType,
        input.sourceEntityType ?? 'OPERATIONAL',
        input.sourceEntityId,
        input.idempotencyKeyHash,
        input.purpose,
        input.purpose === 'OPERATIONAL_MOBILE' ? input.userId : null,
        input.purpose === 'OPERATIONAL_MOBILE' ? input.targetBranchId : null,
        input.payloadRedactedJson ?? '{}',
        input.amount_cents ?? null,
        input.deepLinkKind ?? 'cash_close',
        input.deepLinkEntityId ?? input.sourceEntityId,
        ttlSeconds,
        input.collapseKey ?? `${input.eventType}:${input.sourceEntityId}`,
        now,
        expiresAt,
      ],
    ),
    statement(db, `DELETE FROM atomic_guards WHERE id = ?`, [guardId]),
  ]);
  return { queued: true, alreadyApplied: false, eventId };
}

export async function revokePushConsentAtomic(
  db: LooseD1Database,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly consentId: string;
    readonly now: string;
  },
): Promise<{ readonly revoked: true; readonly subscriptionsDisabled: number }> {
  const count = await first<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM push_subscriptions
     WHERE tenant_id = ? AND user_id = ? AND consent_id = ? AND status = 'ACTIVE'`,
    [input.tenantId, input.userId, input.consentId],
  );
  const guardId = crypto.randomUUID();
  await atomicBatch(db, [
    statement(
      db,
      `INSERT INTO atomic_guards(id, ok)
       SELECT ?, CASE WHEN EXISTS (
         SELECT 1 FROM push_consents
         WHERE tenant_id = ? AND user_id = ? AND id = ?
       ) THEN 1 ELSE 0 END`,
      [guardId, input.tenantId, input.userId, input.consentId],
    ),
    statement(
      db,
      `UPDATE push_consents SET revoked_at = ?
       WHERE tenant_id = ? AND user_id = ? AND id = ? AND revoked_at IS NULL`,
      [input.now, input.tenantId, input.userId, input.consentId],
    ),
    statement(
      db,
      `UPDATE push_subscriptions
       SET status = 'REVOKED', revoked_at = ?, updated_at = ?
       WHERE tenant_id = ? AND user_id = ? AND consent_id = ? AND status = 'ACTIVE'`,
      [input.now, input.now, input.tenantId, input.userId, input.consentId],
    ),
    statement(db, `DELETE FROM atomic_guards WHERE id = ?`, [guardId]),
  ]);
  return { revoked: true, subscriptionsDisabled: count?.count ?? 0 };
}

export interface ClaimedPushDelivery {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly subscriptionId: string;
  readonly provider: 'WEB_PUSH' | 'FCM_HTTP_V1';
  readonly attemptCount: number;
  readonly ttlSeconds: number;
  readonly collapseKey: string;
}

interface DeliveryRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_id: string;
  readonly subscription_id: string;
  readonly provider: 'WEB_PUSH' | 'FCM_HTTP_V1';
  readonly attempt_count: number;
  readonly ttl_seconds: number;
  readonly collapse_key: string;
}

export async function claimPushDeliveries(
  db: LooseD1Database,
  input: {
    readonly tenantId: string;
    readonly workerIdHash: string;
    readonly limit: number;
    readonly now: string;
    readonly leaseSeconds?: number;
    /** ADR-0036: acota el lease al evento productor (despacho inline post-enqueue). */
    readonly eventId?: string;
  },
): Promise<{ readonly deliveries: readonly ClaimedPushDelivery[]; readonly hasMore: boolean }> {
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit)));
  const eventClause = input.eventId ? 'AND event_id = ?' : '';
  const candidates = await all<{ id: string }>(
    db,
    `SELECT id FROM push_deliveries
     WHERE tenant_id = ?
       AND (
         (status IN ('PENDING','RETRY')
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
         OR (status = 'LEASED' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
       )
       ${eventClause}
     ORDER BY COALESCE(next_retry_at, created_at), created_at, id
     LIMIT ?`,
    [
      input.tenantId,
      input.now,
      input.now,
      input.now,
      ...(input.eventId ? [input.eventId] : []),
      limit + 1,
    ],
  );
  const selected = candidates.slice(0, limit);
  if (selected.length === 0) return { deliveries: [], hasMore: false };
  const leaseSeconds = Math.min(300, Math.max(1, Math.floor(input.leaseSeconds ?? 60)));
  const leaseExpiresAt = new Date(Date.parse(input.now) + leaseSeconds * 1000).toISOString();
  await atomicBatch(
    db,
    selected.map(({ id }) =>
      statement(
        db,
        `UPDATE push_deliveries
         SET status = 'LEASED', lease_owner_hash = ?, lease_expires_at = ?,
             updated_at = ?
         WHERE tenant_id = ? AND id = ?
           AND (
             (status IN ('PENDING','RETRY')
               AND (next_retry_at IS NULL OR next_retry_at <= ?))
             OR (status = 'LEASED' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
           )`,
        [input.workerIdHash, leaseExpiresAt, input.now, input.tenantId, id, input.now, input.now],
      ),
    ),
  );
  const placeholders = selected.map(() => '?').join(',');
  const rows = await all<DeliveryRow>(
    db,
    `SELECT id, tenant_id, event_id, subscription_id, provider,
            attempt_count, ttl_seconds, collapse_key
     FROM push_deliveries
     WHERE tenant_id = ? AND lease_owner_hash = ? AND id IN (${placeholders})
     ORDER BY created_at, id`,
    [input.tenantId, input.workerIdHash, ...selected.map(({ id }) => id)],
  );
  return {
    deliveries: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      eventId: row.event_id,
      subscriptionId: row.subscription_id,
      provider: row.provider,
      attemptCount: row.attempt_count,
      ttlSeconds: row.ttl_seconds,
      collapseKey: row.collapse_key,
    })),
    hasMore: candidates.length > limit,
  };
}

export async function acknowledgePushDeliveryAtomic(
  db: LooseD1Database,
  input: {
    readonly tenantId: string;
    readonly deliveryId: string;
    readonly subscriptionId: string;
    readonly userId: string;
    readonly deviceFingerprint: string;
    readonly branchId?: string;
    readonly terminalId?: string;
    readonly receiptHash: string;
    readonly now: string;
    readonly displayContext?: 'NORMAL' | 'OFFLINE' | 'DOZE';
  },
): Promise<{ readonly displayed: boolean; readonly replay: boolean }> {
  const current = await first<{ ack_consumed_at: string | null }>(
    db,
    `SELECT delivery.ack_consumed_at
     FROM push_deliveries delivery
     JOIN push_subscriptions subscription
       ON subscription.tenant_id = delivery.tenant_id
      AND subscription.id = delivery.subscription_id
     WHERE delivery.tenant_id = ?
       AND delivery.id = ?
       AND delivery.subscription_id = ?
       AND delivery.ack_receipt_hash = ?
       AND subscription.user_id = ?
       AND subscription.device_fingerprint = ?
       AND (? IS NULL OR subscription.branch_id = ?)
       AND (? IS NULL OR subscription.terminal_id = ?)
     LIMIT 1`,
    [
      input.tenantId,
      input.deliveryId,
      input.subscriptionId,
      input.receiptHash,
      input.userId,
      input.deviceFingerprint,
      input.branchId ?? null,
      input.branchId ?? null,
      input.terminalId ?? null,
      input.terminalId ?? null,
    ],
  );
  if (current?.ack_consumed_at) return { displayed: false, replay: true };
  if (!current) return { displayed: false, replay: false };

  await atomicBatch(db, [
    statement(
      db,
      `UPDATE push_deliveries
       SET status = 'DISPLAYED', displayed_at = ?, display_context = ?,
           ack_consumed_at = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ? AND subscription_id = ?
         AND status = 'ACCEPTED'
         AND ack_receipt_hash = ?
         AND ack_consumed_at IS NULL
         AND ack_expires_at >= ?
         AND EXISTS (
           SELECT 1
           FROM push_subscriptions subscription
           JOIN push_consents consent
             ON consent.tenant_id = subscription.tenant_id
            AND consent.id = subscription.consent_id
           WHERE subscription.tenant_id = push_deliveries.tenant_id
             AND subscription.id = push_deliveries.subscription_id
             AND subscription.user_id = ?
             AND subscription.device_fingerprint = ?
             AND (? IS NULL OR subscription.branch_id = ?)
             AND (? IS NULL OR subscription.terminal_id = ?)
             AND subscription.status = 'ACTIVE'
             AND consent.revoked_at IS NULL
         )`,
      [
        input.now,
        input.displayContext ?? 'NORMAL',
        input.now,
        input.now,
        input.tenantId,
        input.deliveryId,
        input.subscriptionId,
        input.receiptHash,
        input.now,
        input.userId,
        input.deviceFingerprint,
        input.branchId ?? null,
        input.branchId ?? null,
        input.terminalId ?? null,
        input.terminalId ?? null,
      ],
    ),
  ]);
  const updated = await first<{ ack_consumed_at: string | null }>(
    db,
    `SELECT ack_consumed_at FROM push_deliveries
     WHERE tenant_id = ? AND id = ? AND subscription_id = ?`,
    [input.tenantId, input.deliveryId, input.subscriptionId],
  );
  return { displayed: updated?.ack_consumed_at === input.now, replay: false };
}

export type MobilePushD1Database = D1DatabaseLike;
