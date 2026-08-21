/**
 * Sprint 22 — payment_captures ACID (PENDING → CAPTURED/FAILED; idempotent).
 */
import {
  assertCaptureTransition,
  buildCaptureIdempotencyKey,
  methodCodeToAcquirer,
  type CaptureStatus,
  type PaymentAcquirerCode,
  type PaymentMethodCode,
} from '@kipuspay/domain-integrations';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface CreatePendingCaptureInput {
  readonly saleId: string;
  readonly salePaymentId: string;
  readonly methodCode: PaymentMethodCode;
  readonly amountCents: number;
  readonly idempotencyKey: string;
  readonly acquirerRef?: string | null;
}

export interface SettleCaptureInput {
  readonly captureId: string;
  readonly toStatus: 'CAPTURED' | 'FAILED';
  readonly acquirerRef?: string | null;
}

export interface CreatePendingCaptureResult {
  readonly id: string;
  readonly status: CaptureStatus;
  readonly idempotent: boolean;
}

/**
 * US-02: la misma idempotencyKey con payload distinto es un error de cliente
 * (409 idempotency_mismatch en la ruta), nunca un replay silencioso de una
 * fila ajena. Código estable (no es el mensaje crudo del constraint D1).
 */
export function isIdempotencyMismatch(error: unknown): boolean {
  return error instanceof Error && error.message === 'IDEMPOTENCY_MISMATCH';
}

/**
 * US-02: fallo de infraestructura en el camino idempotente (re-SELECT del
 * ganador con la DB caída). Código estable fail-closed: la ruta lo convierte
 * en 503 DB_UNAVAILABLE, jamás en un 422 con el SQL interno del constraint.
 */
export function isDbUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === 'DB_UNAVAILABLE';
}

interface CaptureReplayRow {
  id: string;
  status: CaptureStatus;
  sale_id: string;
  sale_payment_id: string;
  amount_cents: number;
}

/** Fallo de constraint en batch D1 (patrón existente en process-offline-sale-atomic). */
function isUniqueConstraint(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /UNIQUE|constraint/i.test(msg);
}

async function selectCaptureByKey(
  db: D1DatabaseLike,
  tenantId: string,
  idempotencyKey: string,
): Promise<CaptureReplayRow | null> {
  return db
    .prepare(
      `SELECT id, status, sale_id, sale_payment_id, amount_cents FROM payment_captures
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(tenantId, idempotencyKey)
    .first<CaptureReplayRow>();
}

function resolveCaptureReplay(
  row: CaptureReplayRow,
  input: CreatePendingCaptureInput,
): CreatePendingCaptureResult {
  if (
    row.sale_id !== input.saleId ||
    row.sale_payment_id !== input.salePaymentId ||
    row.amount_cents !== input.amountCents
  ) {
    throw new Error('IDEMPOTENCY_MISMATCH');
  }
  return { id: row.id, status: row.status, idempotent: true };
}

export async function createPendingCaptureAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: CreatePendingCaptureInput,
): Promise<CreatePendingCaptureResult> {
  const existing = await selectCaptureByKey(db, tenantId, input.idempotencyKey);
  if (existing) return resolveCaptureReplay(existing, input);

  const acquirer = methodCodeToAcquirer(input.methodCode);
  if (!acquirer) throw new Error('CAPTURE_REQUIRES_ACQUIRER');
  if (!(input.amountCents > 0) || !Number.isInteger(input.amountCents)) {
    throw new Error('INVALID_CAPTURE_AMOUNT');
  }

  const id = crypto.randomUUID();
  try {
    await runD1AtomicPlan(db, (plan) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO payment_captures (
                 id, tenant_id, sale_id, sale_payment_id, acquirer, acquirer_ref,
                 status, amount_cents, idempotency_key
               ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          )
          .bind(
            id,
            tenantId,
            input.saleId,
            input.salePaymentId,
            acquirer,
            input.acquirerRef ?? null,
            input.amountCents,
            input.idempotencyKey,
          ),
      );
    });
  } catch (e) {
    // US-02: carrera concurrente multi-dispositivo — el otro request ganó el
    // INSERT y la UNIQUE (tenant_id, idempotency_key) rechazó el nuestro.
    // Re-SELECT de la fila ganadora: replay idempotente (o mismatch); jamás
    // propagar el error crudo del constraint a la ruta (422 no idempotente).
    if (!isUniqueConstraint(e)) throw e;
    try {
      const winner = await selectCaptureByKey(db, tenantId, input.idempotencyKey);
      if (winner) return resolveCaptureReplay(winner, input);
    } catch (inner) {
      // IDEMPOTENCY_MISMATCH es error de cliente y se propaga; cualquier otro
      // fallo del re-SELECT (DB caída) es infraestructura: fail-closed con
      // código estable DB_UNAVAILABLE, jamás el SQL interno del constraint.
      if (isIdempotencyMismatch(inner)) throw inner;
      throw new Error('DB_UNAVAILABLE');
    }
    // El UNIQUE disparó pero la fila ganadora no es visible: sin DB no hay
    // reconciliación idempotente posible → fail-closed (503 en la ruta).
    throw new Error('DB_UNAVAILABLE');
  }
  return { id, status: 'PENDING', idempotent: false };
}

export async function settleCaptureAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: SettleCaptureInput,
): Promise<{ readonly id: string; readonly status: CaptureStatus }> {
  const row = await db
    .prepare(
      `SELECT id, status FROM payment_captures
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(input.captureId, tenantId)
    .first<{ id: string; status: CaptureStatus }>();
  if (!row) throw new Error('CAPTURE_NOT_FOUND');
  assertCaptureTransition(row.status, input.toStatus);

  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1 FROM payment_captures WHERE id = ? AND tenant_id = ? AND status = 'PENDING'`,
      [input.captureId, tenantId],
    );
    plan.add(
      db
        .prepare(
          `UPDATE payment_captures
           SET status = ?, acquirer_ref = COALESCE(?, acquirer_ref)
           WHERE id = ? AND tenant_id = ? AND status = 'PENDING'`,
        )
        .bind(input.toStatus, input.acquirerRef ?? null, input.captureId, tenantId),
    );
  });
  return { id: input.captureId, status: input.toStatus };
}

export async function insertManualCaptureAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: {
    readonly saleId: string;
    readonly salePaymentId: string;
    readonly acquirer: PaymentAcquirerCode;
    readonly amountCents: number;
    readonly idempotencyKey: string;
    readonly acquirerRef?: string | null;
  },
): Promise<{ readonly id: string }> {
  const existing = await db
    .prepare(
      `SELECT id FROM payment_captures
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(tenantId, input.idempotencyKey)
    .first<{ id: string }>();
  if (existing) return { id: existing.id };

  const id = crypto.randomUUID();
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO payment_captures (
               id, tenant_id, sale_id, sale_payment_id, acquirer, acquirer_ref,
               status, amount_cents, idempotency_key
             ) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_ELECTRONIC_CAPTURE', ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          input.saleId,
          input.salePaymentId,
          input.acquirer,
          input.acquirerRef ?? null,
          input.amountCents,
          input.idempotencyKey,
        ),
    );
  });
  return { id };
}

export { buildCaptureIdempotencyKey };
