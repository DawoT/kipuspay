/**
 * Sprint 24 — reserve loyalty.points (online) + expire sweep (§5.4 / edge A).
 */
import {
  assertLoyaltyTransition,
  assertPointsBalanceNonNegative,
  buildLoyaltyIdempotencyKey,
  type LoyaltyReservationStatus,
} from '@kipuspay/domain-integrations';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface ReserveLoyaltyInput {
  readonly customerId: string;
  readonly saleIdempotencyKey: string;
  readonly points: number;
  readonly expiresAtIso?: string;
  readonly nowMs?: number;
}

export interface ReserveLoyaltyResult {
  readonly id: string;
  readonly status: LoyaltyReservationStatus;
  readonly points: number;
  readonly idempotent: boolean;
}

async function ensureAccount(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO loyalty_accounts (id, tenant_id, customer_id, points_balance)
       VALUES (?, ?, ?, 0)
       ON CONFLICT (tenant_id, customer_id) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), tenantId, customerId)
    .run();
}

export async function reserveLoyaltyPointsAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: ReserveLoyaltyInput,
): Promise<ReserveLoyaltyResult> {
  const key = buildLoyaltyIdempotencyKey(input.saleIdempotencyKey);
  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw new Error('LOYALTY_POINTS_INVALID');
  }

  const existing = await db
    .prepare(
      `SELECT id, status, points FROM loyalty_reservations
       WHERE tenant_id = ? AND sale_idempotency_key = ? LIMIT 1`,
    )
    .bind(tenantId, key)
    .first<{ id: string; status: LoyaltyReservationStatus; points: number }>();
  if (existing) {
    return {
      id: existing.id,
      status: existing.status,
      points: existing.points,
      idempotent: true,
    };
  }

  await ensureAccount(db, tenantId, input.customerId);

  const account = await db
    .prepare(
      `SELECT points_balance FROM loyalty_accounts
       WHERE tenant_id = ? AND customer_id = ? LIMIT 1`,
    )
    .bind(tenantId, input.customerId)
    .first<{ points_balance: number }>();
  const balance = account?.points_balance ?? 0;
  assertPointsBalanceNonNegative(balance);

  const reserved = await db
    .prepare(
      `SELECT COALESCE(SUM(points), 0) AS reserved_points
       FROM loyalty_reservations
       WHERE tenant_id = ? AND customer_id = ? AND status = 'RESERVED'`,
    )
    .bind(tenantId, input.customerId)
    .first<{ reserved_points: number }>();
  const available = balance - (reserved?.reserved_points ?? 0);
  if (available < input.points) {
    throw new Error('LOYALTY_INSUFFICIENT_POINTS');
  }

  const nowMs = input.nowMs ?? Date.now();
  const expiresAt =
    input.expiresAtIso ??
    new Date(nowMs + DEFAULT_TTL_MS).toISOString().replace('T', ' ').substring(0, 19);
  const id = crypto.randomUUID();

  await runD1AtomicPlan(db, (plan) => {
    const guardId = crypto.randomUUID();
    plan.add(
      db
        .prepare(
          `INSERT INTO atomic_guards (id, ok)
           SELECT ?, CASE
             WHEN (
               SELECT points_balance FROM loyalty_accounts
               WHERE tenant_id = ? AND customer_id = ?
             ) - COALESCE((
               SELECT SUM(points) FROM loyalty_reservations
               WHERE tenant_id = ? AND customer_id = ? AND status = 'RESERVED'
             ), 0) >= ? THEN 1 ELSE 0 END`,
        )
        .bind(guardId, tenantId, input.customerId, tenantId, input.customerId, input.points),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO loyalty_reservations (
               id, tenant_id, customer_id, sale_idempotency_key, points, status, expires_at
             ) VALUES (?, ?, ?, ?, ?, 'RESERVED', ?)`,
        )
        .bind(id, tenantId, input.customerId, key, input.points, expiresAt),
    );
    plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(guardId));
  });

  return { id, status: 'RESERVED', points: input.points, idempotent: false };
}

export async function expireLoyaltyReservationsAtomic(
  db: D1DatabaseLike,
  nowIso?: string,
  limit = 100,
): Promise<{ readonly expired: number; readonly ids: readonly string[] }> {
  const cutoff = nowIso ?? new Date().toISOString().replace('T', ' ').substring(0, 19);
  const { results } = await db
    .prepare(
      `SELECT id, tenant_id, status FROM loyalty_reservations
       WHERE status = 'RESERVED' AND expires_at <= ?
       ORDER BY expires_at ASC LIMIT ?`,
    )
    .bind(cutoff, limit)
    .all<{ id: string; tenant_id: string; status: LoyaltyReservationStatus }>();

  const rows = results ?? [];
  const ids: string[] = [];
  for (const row of rows) {
    assertLoyaltyTransition(row.status, 'EXPIRED');
    await runD1AtomicPlan(db, (plan) => {
      plan.add(
        db
          .prepare(
            `UPDATE loyalty_reservations
             SET status = 'EXPIRED'
             WHERE id = ? AND tenant_id = ? AND status = 'RESERVED'`,
          )
          .bind(row.id, row.tenant_id),
      );
    });
    ids.push(row.id);
  }
  return { expired: ids.length, ids };
}
