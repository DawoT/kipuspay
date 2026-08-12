/**
 * Sprint 51 — ops.shift_handoff (Arquitectura §5.3 regla 35).
 *
 * - POST /api/cash/shifts/pin: el saliente emite el PIN temporal de un solo
 *   uso (TTL 5 min; se devuelve en claro una sola vez, en la DB solo hash).
 * - POST /api/cash/shifts/transfer: el entrante consume el PIN; la sesión
 *   sigue OPEN (nunca un cierre Z); conteo ligero intermedio si la política
 *   del tenant lo exige (diferencia auditada, no bloquea).
 *
 * Gating: flag default-off → 404. El tenant/operador vienen del JWT.
 */
import { issueShiftPinAtomic, processShiftTransferAtomic } from '@kipuspay/adapters-d1';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

export interface ShiftEnv {
  readonly FEATURE_SHIFT_HANDOFF?: string;
  readonly DB?: unknown;
}

export function isShiftHandoffEnabled(env: ShiftEnv | undefined): boolean {
  return env?.FEATURE_SHIFT_HANDOFF === '1';
}

export async function runIssueShiftPinHttp(
  env: ShiftEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isShiftHandoffEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'SHIFT_DB_UNAVAILABLE' } };
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return { status: 400, body: { code: 'BAD_REQUEST', error: 'sessionId required' } };
  }
  const issued = await issueShiftPinAtomic(env.DB as never, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    sessionId,
  });
  if (!issued.ok) return { status: issued.status, body: issued.body };
  return {
    status: 200,
    body: {
      shiftId: issued.shiftId,
      pin: issued.pin,
      expiresAtIso: issued.expiresAtIso,
      ttlSeconds: 300,
    },
  };
}

export async function runShiftTransferHttp(
  env: ShiftEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isShiftHandoffEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'SHIFT_DB_UNAVAILABLE' } };
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const outgoingUserId = typeof body.outgoingUserId === 'string' ? body.outgoingUserId.trim() : '';
  const interimCountCents =
    body.interimCountCents === undefined || body.interimCountCents === null
      ? null
      : typeof body.interimCountCents === 'number' && Number.isSafeInteger(body.interimCountCents)
        ? body.interimCountCents
        : NaN;
  if (!sessionId || !pin || !outgoingUserId) {
    return {
      status: 400,
      body: { code: 'BAD_REQUEST', error: 'sessionId, pin and outgoingUserId required' },
    };
  }
  if (Number.isNaN(interimCountCents)) {
    return { status: 422, body: { code: 'INTERIM_COUNT_INVALID' } };
  }
  const transferred = await processShiftTransferAtomic(env.DB as never, {
    tenantId: actor.tenantId,
    sessionId,
    outgoingUserId,
    incomingUserId: actor.userId,
    pin,
    interimCountCents: interimCountCents,
  });
  if (!transferred.ok) return { status: transferred.status, body: transferred.body };
  return {
    status: 200,
    body: {
      shiftId: transferred.shiftId,
      incomingUserId: transferred.incomingUserId,
      startedAtIso: transferred.startedAtIso,
      cashDiffCents: transferred.cashDiffCents,
      interimCountCents: transferred.interimCountCents,
      interimRequired: transferred.interimRequired,
    },
  };
}
