/**
 * Lockout persistente del PIN de caja (SEC-11) sobre las columnas
 * users.pin_attempts / users.pin_locked_until (migración 0050, Sprint 51).
 * Reemplaza el contador en memoria del isolate: el lockout sobrevive
 * evictions y reinicios del worker.
 */
import type { D1DatabaseLike } from './index.js';

export interface PinLockoutState {
  readonly locked: boolean;
  readonly lockedUntilIso: string | null;
  readonly failures: number;
}

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

interface PinLockoutRow {
  pin_attempts: number | null;
  pin_locked_until: string | null;
}

function toState(row: PinLockoutRow | null, nowMs: number): PinLockoutState {
  const failures = row?.pin_attempts ?? 0;
  const lockedUntil = row?.pin_locked_until ?? null;
  const lockedAt = lockedUntil ? Date.parse(lockedUntil) : 0;
  return {
    locked: Number.isFinite(lockedAt) && lockedAt > nowMs,
    lockedUntilIso: lockedUntil,
    failures,
  };
}

export async function readPinLockout(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  nowMs: number,
): Promise<PinLockoutState> {
  const row = await db
    .prepare(`SELECT pin_attempts, pin_locked_until FROM users WHERE id = ? AND tenant_id = ?`)
    .bind(userId, tenantId)
    .first<PinLockoutRow>();
  return toState(row, nowMs);
}

export async function recordPinFailure(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  nowMs: number,
  opts: { maxFailures?: number; lockoutMs?: number } = {},
): Promise<PinLockoutState> {
  const maxFailures = opts.maxFailures ?? PIN_MAX_FAILURES;
  const lockoutMs = opts.lockoutMs ?? PIN_LOCKOUT_MS;
  const lockedUntilIso = new Date(nowMs + lockoutMs).toISOString();
  await db
    .prepare(
      `UPDATE users SET
         pin_attempts = CASE WHEN pin_attempts + 1 >= ? THEN 0 ELSE pin_attempts + 1 END,
         pin_locked_until = CASE
           WHEN pin_locked_until IS NOT NULL AND pin_locked_until > ? THEN pin_locked_until
           WHEN pin_attempts + 1 >= ? THEN ?
           ELSE pin_locked_until
         END
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(maxFailures, new Date(nowMs).toISOString(), maxFailures, lockedUntilIso, userId, tenantId)
    .run();
  return readPinLockout(db, tenantId, userId, nowMs);
}

export async function clearPinLockout(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET pin_attempts = 0, pin_locked_until = NULL
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(userId, tenantId)
    .run();
}
