/**
 * Sprint 24 — loyalty.points + messaging.whatsapp_receipt (Cadena+).
 */
import { expireLoyaltyReservationsAtomic, reserveLoyaltyPointsAtomic } from '@kipuspay/adapters-d1';
import { createWhatsAppMessagingSender } from '@kipuspay/adapters-messaging';
import type { WorkerEnv } from '../auth/control-plane.js';
import { assertCadenaPlusPlan, type HttpResult } from '../integrations/integration-routes.js';
import { runSendOwnerPushHttp } from '../owner/push-routes.js';

export function isLoyaltyPointsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_LOYALTY_POINTS === '1' || env?.FEATURE_LOYALTY_POINTS === 'true';
}

export function isMessagingWhatsAppEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_MESSAGING_WHATSAPP === '1' || env?.FEATURE_MESSAGING_WHATSAPP === 'true';
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

export async function runLoyaltyReserveHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isLoyaltyPointsEnabled(env)) return featureOff('FEATURE_LOYALTY_POINTS');
  if (!env?.DB) return dbUnavailable();
  const plan = await assertCadenaPlusPlan(env, tenantId);
  if (plan) return plan;
  const customerId = typeof body.customerId === 'string' ? body.customerId : '';
  const saleIdempotencyKey =
    typeof body.saleIdempotencyKey === 'string' ? body.saleIdempotencyKey : '';
  const points = typeof body.points === 'number' ? body.points : NaN;
  if (!customerId || !saleIdempotencyKey || !Number.isInteger(points)) {
    return { status: 400, body: { error: 'Invalid body', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await reserveLoyaltyPointsAtomic(env.DB, tenantId, {
      customerId,
      saleIdempotencyKey,
      points,
    });
    return { status: result.idempotent ? 200 : 201, body: { ...result } };
  } catch (e) {
    return mapErr(e);
  }
}

export async function runLoyaltyBalanceHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  customerId: string,
): Promise<HttpResult> {
  if (!isLoyaltyPointsEnabled(env)) return featureOff('FEATURE_LOYALTY_POINTS');
  if (!env?.DB) return dbUnavailable();
  const plan = await assertCadenaPlusPlan(env, tenantId);
  if (plan) return plan;
  if (!customerId.trim()) {
    return { status: 400, body: { error: 'customerId required', code: 'BAD_REQUEST' } };
  }
  const row = await env.DB.prepare(
    `SELECT points_balance FROM loyalty_accounts
     WHERE tenant_id = ? AND customer_id = ? LIMIT 1`,
  )
    .bind(tenantId, customerId)
    .first<{ points_balance: number }>();
  return {
    status: 200,
    body: { customerId, pointsBalance: row?.points_balance ?? 0 },
  };
}

export async function runMessagingOptInHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isMessagingWhatsAppEnabled(env)) return featureOff('FEATURE_MESSAGING_WHATSAPP');
  if (!env?.DB) return dbUnavailable();
  const plan = await assertCadenaPlusPlan(env, tenantId);
  if (plan) return plan;
  const customerId = typeof body.customerId === 'string' ? body.customerId : '';
  const optedIn = body.optedIn === true || body.optedIn === 1 || body.optedIn === '1';
  if (!customerId) {
    return { status: 400, body: { error: 'customerId required', code: 'BAD_REQUEST' } };
  }
  const existing = await env.DB.prepare(
    `SELECT id FROM messaging_opt_ins
     WHERE tenant_id = ? AND customer_id = ? AND channel = 'whatsapp' LIMIT 1`,
  )
    .bind(tenantId, customerId)
    .first<{ id: string }>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE messaging_opt_ins
       SET opted_in = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
    )
      .bind(optedIn ? 1 : 0, existing.id, tenantId)
      .run();
    return { status: 200, body: { id: existing.id, customerId, optedIn, channel: 'whatsapp' } };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO messaging_opt_ins (id, tenant_id, customer_id, channel, opted_in)
     VALUES (?, ?, ?, 'whatsapp', ?)`,
  )
    .bind(id, tenantId, customerId, optedIn ? 1 : 0)
    .run();
  return { status: 201, body: { id, customerId, optedIn, channel: 'whatsapp' } };
}

export async function runExpireLoyaltyCronHttp(env: WorkerEnv | undefined): Promise<HttpResult> {
  if (!isLoyaltyPointsEnabled(env)) return featureOff('FEATURE_LOYALTY_POINTS');
  if (!env?.DB) return dbUnavailable();
  try {
    const result = await expireLoyaltyReservationsAtomic(env.DB);
    return { status: 200, body: { expired: result.expired, ids: result.ids } };
  } catch (e) {
    return mapErr(e);
  }
}

/** Post-commit WhatsApp: best-effort; nunca revierte la venta. */
export async function trySendWhatsAppReceipt(
  env: WorkerEnv | undefined,
  input: {
    readonly tenantId: string;
    readonly customerId: string;
    readonly saleId: string;
    readonly documentKind: 'NV' | 'CPE';
    readonly phoneE164: string;
    readonly representationUrl: string;
  },
): Promise<{ sent: boolean; reason?: string }> {
  if (!isMessagingWhatsAppEnabled(env) || !env?.DB) {
    return { sent: false, reason: 'FEATURE_OFF' };
  }
  try {
    const opt = await env.DB.prepare(
      `SELECT opted_in FROM messaging_opt_ins
       WHERE tenant_id = ? AND customer_id = ? AND channel = 'whatsapp' LIMIT 1`,
    )
      .bind(input.tenantId, input.customerId)
      .first<{ opted_in: number }>();
    if (!opt || opt.opted_in !== 1) {
      return { sent: false, reason: 'OPT_IN_REQUIRED' };
    }
    const sender = createWhatsAppMessagingSender({
      ...(env.WA_ACCESS_TOKEN ? { WA_ACCESS_TOKEN: env.WA_ACCESS_TOKEN } : {}),
      ...(env.WA_PHONE_NUMBER_ID ? { WA_PHONE_NUMBER_ID: env.WA_PHONE_NUMBER_ID } : {}),
      ...(env.WA_API_BASE ? { WA_API_BASE: env.WA_API_BASE } : {}),
    });
    const res = await sender.sendReceipt({
      tenantId: input.tenantId,
      customerId: input.customerId,
      saleId: input.saleId,
      documentKind: input.documentKind,
      phoneE164: input.phoneE164,
      optedIn: true,
      representationUrl: input.representationUrl,
    });
    return { sent: res.accepted };
  } catch {
    return { sent: false, reason: 'SEND_FAILED' };
  }
}

/** Edge A: aviso push al Dueño (best-effort). */
export async function notifyOwnerLoyaltyExpired(
  env: WorkerEnv | undefined,
  tenantId: string,
  saleId: string,
  reservationId: string | null | undefined,
): Promise<void> {
  try {
    await runSendOwnerPushHttp(env, tenantId, {
      title: 'Reserva de puntos expirada',
      body: `Venta ${saleId} consolidada sin puntos (LOYALTY_RESERVATION_EXPIRED${
        reservationId ? ` · ${reservationId}` : ''
      }). Considera crédito de cortesía.`,
    });
  } catch {
    // best-effort
  }
}
