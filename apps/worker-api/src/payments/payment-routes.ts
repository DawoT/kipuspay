/**
 * Sprint 22 — cobro local POS (Yape/Plin/MP/Culqi/Niubiz).
 * Stripe billing SaaS permanece en handle-stripe-webhook (no confundir).
 */
/* eslint-disable complexity -- charge and webhook multi-branch paths */
import {
  createPendingCaptureAtomic,
  isDbUnavailable,
  isIdempotencyMismatch,
  settleCaptureAtomic,
} from '@kipuspay/adapters-d1';
import {
  isCardMethod,
  isPaymentMethodCode,
  isWalletMethod,
  methodCodeToAcquirer,
  type PaymentAcquirerCode,
  type PaymentMethodCode,
} from '@kipuspay/domain-integrations';
import { createPaymentAcquirer } from '@kipuspay/adapters-payments-pe';
import { parseMoneyToCents } from '../http/money-input.js';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isQrWalletsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_PAYMENTS_QR_WALLETS === '1' || env?.FEATURE_PAYMENTS_QR_WALLETS === 'true';
}

export function isCardAcquirerEnabled(env: WorkerEnv | undefined): boolean {
  return (
    env?.FEATURE_PAYMENTS_CARD_ACQUIRER === '1' || env?.FEATURE_PAYMENTS_CARD_ACQUIRER === 'true'
  );
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function mapErr(e: unknown): HttpResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 422, body: { error: msg, code: msg } };
}

function flagForMethod(code: PaymentMethodCode, env: WorkerEnv): HttpResult | null {
  if (isWalletMethod(code) && !isQrWalletsEnabled(env)) {
    return featureOff('FEATURE_PAYMENTS_QR_WALLETS');
  }
  if (isCardMethod(code) && !isCardAcquirerEnabled(env)) {
    return featureOff('FEATURE_PAYMENTS_CARD_ACQUIRER');
  }
  return null;
}

function secretFor(env: WorkerEnv, acquirer: PaymentAcquirerCode): string | null {
  const map: Record<PaymentAcquirerCode, string | undefined> = {
    yape: env.YAPE_WEBHOOK_SECRET,
    plin: env.PLIN_WEBHOOK_SECRET,
    mercadopago: env.MP_WEBHOOK_SECRET,
    culqi: env.CULQI_WEBHOOK_SECRET,
    niubiz: env.NIUBIZ_WEBHOOK_SECRET,
  };
  const secret = map[acquirer];
  return secret && secret.trim() !== '' ? secret : null;
}

export async function runPaymentChargeHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    saleId?: string;
    salePaymentId?: string;
    paymentMethodId?: string;
    amountCents?: number | string;
    idempotencyKey?: string;
    chargeId?: string;
  },
): Promise<HttpResult> {
  if (!env?.DB) return dbUnavailable();
  const saleId = body.saleId?.trim() ?? '';
  const salePaymentId = body.salePaymentId?.trim() ?? '';
  const paymentMethodId = body.paymentMethodId?.trim() ?? '';
  // US-06: parseMoneyToCents devuelve resultado discriminado {ok,errorName}.
  const parsedAmount = parseMoneyToCents(body.amountCents ?? 0);
  const amountCents = parsedAmount.ok ? parsedAmount.cents : null;
  const idempotencyKey = body.idempotencyKey?.trim() ?? '';
  if (!saleId || !salePaymentId || !paymentMethodId || !idempotencyKey) {
    return { status: 400, body: { error: 'missing fields', code: 'BAD_REQUEST' } };
  }
  if (amountCents === null || amountCents <= 0) {
    // US-01: 422 invalid_amount (contrato del acceptance — la validación
    // ocurre ANTES de tocar D1: ningún statement se ejecuta con monto inválido).
    return { status: 422, body: { error: 'invalid_amount', code: 'invalid_amount' } };
  }

  const pm = await env.DB.prepare(
    `SELECT code FROM payment_methods WHERE tenant_id = ? AND id = ? LIMIT 1`,
  )
    .bind(tenantId, paymentMethodId)
    .first<{ code: string }>();
  if (!pm || !isPaymentMethodCode(pm.code)) {
    return {
      status: 422,
      body: { error: 'INVALID_PAYMENT_METHOD', code: 'INVALID_PAYMENT_METHOD' },
    };
  }
  const flagErr = flagForMethod(pm.code, env);
  if (flagErr) return flagErr;

  const acquirer = methodCodeToAcquirer(pm.code);
  if (!acquirer) {
    return { status: 422, body: { error: 'NOT_ACQUIRER_METHOD', code: 'NOT_ACQUIRER_METHOD' } };
  }

  try {
    const pending = await createPendingCaptureAtomic(env.DB, tenantId, {
      saleId,
      salePaymentId,
      methodCode: pm.code,
      amountCents,
      idempotencyKey,
    });
    // US-02/A2: el replay (perdedor) devuelve un body IDÉNTICO al del ganador:
    // mismo payment_id (el id del capture original), status REAL del capture
    // (nunca un 'replayed' inventado) y el reasonCode estable 'IDEMPOTENCY_REPLAY'.
    // Convención 200/201 de loyalty-messaging: mismo body, solo cambia el status.
    if (pending.idempotent) {
      return {
        status: 200,
        body: {
          payment_id: pending.id,
          captureId: pending.id,
          status: pending.status,
          idempotent: true,
          reasonCode: 'IDEMPOTENCY_REPLAY',
        },
      };
    }

    const port = createPaymentAcquirer(acquirer);
    const chargeId = body.chargeId?.trim() || pending.id;
    const charged = await port.charge({
      chargeId,
      amountCents,
      currency: 'PEN',
      acquirer,
      idempotencyKey,
    });

    if (charged.status === 'PENDING') {
      return {
        status: 201,
        body: {
          captureId: pending.id,
          status: 'PENDING',
          reference: charged.reference,
          idempotent: false,
        },
      };
    }

    const settled = await settleCaptureAtomic(env.DB, tenantId, {
      captureId: pending.id,
      toStatus: charged.status === 'FAILED' ? 'FAILED' : 'CAPTURED',
      acquirerRef: charged.reference,
    });

    return {
      status: 201,
      body: {
        captureId: settled.id,
        status: settled.status,
        reference: charged.reference,
        idempotent: false,
      },
    };
  } catch (e) {
    // US-02: la UNIQUE de idempotency chocó con un payload distinto → 409
    // idempotency_mismatch, nunca un 422 crudo del constraint (mapErr).
    if (isIdempotencyMismatch(e)) {
      return { status: 409, body: { error: 'idempotency_mismatch', code: 'idempotency_mismatch' } };
    }
    // US-02: re-SELECT del ganador con la DB caída → fail-closed 503 estable
    // (DB_UNAVAILABLE), jamás el SQL interno del constraint bajo un 422.
    if (isDbUnavailable(e)) {
      return dbUnavailable();
    }
    return mapErr(e);
  }
}

export async function runPaymentCaptureGetHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  captureId: string,
): Promise<HttpResult> {
  if (!isQrWalletsEnabled(env) && !isCardAcquirerEnabled(env)) {
    return featureOff('FEATURE_PAYMENTS_*');
  }
  if (!env?.DB) return dbUnavailable();
  const row = await env.DB.prepare(
    `SELECT id, status, acquirer, acquirer_ref, amount_cents, sale_id
     FROM payment_captures WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(captureId, tenantId)
    .first<Record<string, unknown>>();
  if (!row) return { status: 404, body: { error: 'NOT_FOUND', code: 'NOT_FOUND' } };
  return { status: 200, body: row };
}

export async function runPaymentWebhookHttp(
  env: WorkerEnv | undefined,
  acquirerRaw: string,
  rawBody: string,
  signatureHeader: string,
  timestampSec: number,
): Promise<HttpResult> {
  // POS acquirer webhooks — not Stripe SaaS billing.
  const acquirer = acquirerRaw as PaymentAcquirerCode;
  const allowed: PaymentAcquirerCode[] = ['yape', 'plin', 'mercadopago', 'culqi', 'niubiz'];
  if (!allowed.includes(acquirer)) {
    return { status: 404, body: { error: 'UNKNOWN_ACQUIRER', code: 'UNKNOWN_ACQUIRER' } };
  }
  if (acquirer === 'yape' || acquirer === 'plin' || acquirer === 'mercadopago') {
    if (!isQrWalletsEnabled(env)) return featureOff('FEATURE_PAYMENTS_QR_WALLETS');
  } else if (!isCardAcquirerEnabled(env)) {
    return featureOff('FEATURE_PAYMENTS_CARD_ACQUIRER');
  }
  if (!env?.DB) return dbUnavailable();

  const secret = secretFor(env, acquirer);
  if (!secret) {
    return {
      status: 503,
      body: { error: 'WEBHOOK_SECRET_NOT_CONFIGURED', code: 'WEBHOOK_SECRET_NOT_CONFIGURED' },
    };
  }

  const port = createPaymentAcquirer(acquirer);
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const verified = await port.verifyWebhook({
      acquirer,
      rawBody,
      signatureHeader,
      timestampSec,
      nowSec,
      secret,
    });
    if (!verified.ok || !verified.chargeId || !verified.status) {
      return { status: 401, body: { error: 'INVALID_SIGNATURE', code: 'INVALID_SIGNATURE' } };
    }
    if (verified.status !== 'CAPTURED' && verified.status !== 'FAILED') {
      return { status: 422, body: { error: 'UNSUPPORTED_STATUS', code: 'UNSUPPORTED_STATUS' } };
    }

    const eventId = `${acquirer}:${verified.chargeId}:${verified.status}`;
    const dedupDb = env.WEBHOOK_EVENTS_DB ?? env.DB;

    const row = await env.DB.prepare(
      `SELECT id, tenant_id, status FROM payment_captures
       WHERE acquirer = ? AND (id = ? OR acquirer_ref = ?) LIMIT 1`,
    )
      .bind(acquirer, verified.chargeId, verified.reference)
      .first<{ id: string; tenant_id: string; status: string }>();

    // B2 (47b): el webhook puede llegar ANTES de que el POS cree el capture
    // PENDING (o con la DB de dedup caída). Jamás ackear 200 sin materializar:
    // - capture aún no existe → 202 retryable y SIN dedup (el proveedor reintenta
    //   y el retry encontrará el PENDING cuando exista).
    // - dedup falla después del settle → 503 retryable (settle idempotente por
    //   guardState; el retry recibe dedup-ack).
    if (!row) {
      return {
        status: 202,
        body: { ok: false, code: 'CAPTURE_NOT_MATERIALIZED', retryable: true },
      };
    }
    if (row.status !== 'PENDING') {
      // Ya materializado en estado terminal: dedup-ack para frenar reintentos.
      try {
        await dedupDb
          .prepare(
            `INSERT INTO webhook_events (id, source, event_id, payload_hash)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), acquirer, eventId, signatureHeader.slice(0, 64))
          .run();
      } catch {
        // Estado terminal persistido: ack seguro aunque el dedup falle.
      }
      return { status: 200, body: { ok: true, dedup: true } };
    }

    const next = verified.status === 'FAILED' ? 'FAILED' : 'CAPTURED';
    await settleCaptureAtomic(env.DB, row.tenant_id, {
      captureId: row.id,
      toStatus: next,
      acquirerRef: verified.reference,
    });
    try {
      await dedupDb
        .prepare(
          `INSERT INTO webhook_events (id, source, event_id, payload_hash)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), acquirer, eventId, signatureHeader.slice(0, 64))
        .run();
    } catch {
      return { status: 503, body: { error: 'WEBHOOK_DEDUP_FAILED', code: 'WEBHOOK_DEDUP_FAILED' } };
    }

    return { status: 200, body: { ok: true } };
  } catch (e) {
    return mapErr(e);
  }
}

export async function runOwnerUncapturedPaymentsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isQrWalletsEnabled(env) && !isCardAcquirerEnabled(env)) {
    return featureOff('FEATURE_PAYMENTS_*');
  }
  if (!env?.DB) return dbUnavailable();

  const rows = await env.DB.prepare(
    `SELECT id, sale_id, acquirer, status, amount_cents, acquirer_ref, created_at
     FROM payment_captures
     WHERE tenant_id = ?
       AND status IN ('MANUAL_ELECTRONIC_CAPTURE', 'PENDING')
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all();

  return {
    status: 200,
    body: {
      uncaptured: rows.results ?? [],
    },
  };
}
