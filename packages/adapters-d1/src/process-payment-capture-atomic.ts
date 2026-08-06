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

export async function createPendingCaptureAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: CreatePendingCaptureInput,
): Promise<{ readonly id: string; readonly status: CaptureStatus; readonly idempotent: boolean }> {
  const existing = await db
    .prepare(
      `SELECT id, status FROM payment_captures
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(tenantId, input.idempotencyKey)
    .first<{ id: string; status: CaptureStatus }>();
  if (existing) {
    return { id: existing.id, status: existing.status, idempotent: true };
  }

  const acquirer = methodCodeToAcquirer(input.methodCode);
  if (!acquirer) throw new Error('CAPTURE_REQUIRES_ACQUIRER');
  if (!(input.amountCents > 0) || !Number.isInteger(input.amountCents)) {
    throw new Error('INVALID_CAPTURE_AMOUNT');
  }

  const id = crypto.randomUUID();
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
