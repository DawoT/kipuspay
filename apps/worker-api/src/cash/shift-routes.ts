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
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export interface ShiftEnv {
  readonly FEATURE_SHIFT_HANDOFF?: string;
  readonly DB?: unknown;
}

const SHIFT_ROLES = new Set(['cashier', 'supervisor']);

async function requireShiftHandoff(env: ShiftEnv, tenantId: string): Promise<HttpResult | null> {
  try {
    await new CapabilityResolver(env as never).require(tenantId, 'ops.shift_handoff');
    return null;
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status,
        body: { code: error.status === 404 ? 'FEATURE_OFF' : error.code },
      };
    }
    return { status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } };
  }
}

export function isShiftHandoffEnabled(env: ShiftEnv | undefined): boolean {
  return env?.FEATURE_SHIFT_HANDOFF === '1';
}

export async function runIssueShiftPinHttp(
  env: ShiftEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!env.DB) return { status: 503, body: { code: 'SHIFT_DB_UNAVAILABLE' } };
  const capabilityError = await requireShiftHandoff(env, actor.tenantId);
  if (capabilityError) return capabilityError;
  // S51-H3: emitir el PIN de handoff lo hace quien opera la caja
  // (cashier/supervisor) — jamás admin/owner ajeno ni un rol sin turno.
  const role = actor.role.toLowerCase();
  if (role !== 'cashier' && role !== 'supervisor') {
    return { status: 403, body: { code: 'FORBIDDEN_ROLE' } };
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return { status: 400, body: { code: 'BAD_REQUEST', error: 'sessionId required' } };
  }
  const issued = await issueShiftPinAtomic(env.DB as never, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    sessionId,
    branchId: actor.branchId,
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

// eslint-disable-next-line complexity -- transfer: sender/receiver × cash states × guards
export async function runShiftTransferHttp(
  env: ShiftEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!env.DB) return { status: 503, body: { code: 'SHIFT_DB_UNAVAILABLE' } };
  const capabilityError = await requireShiftHandoff(env, actor.tenantId);
  if (capabilityError) return capabilityError;
  if (!SHIFT_ROLES.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN_ROLE' } };
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const outgoingUserId = typeof body.outgoingUserId === 'string' ? body.outgoingUserId.trim() : '';
  const interimCountCents =
    body.interimCountCents === undefined || body.interimCountCents === null
      ? null
      : typeof body.interimCountCents === 'number' && Number.isSafeInteger(body.interimCountCents)
        ? body.interimCountCents
        : NaN;
  // S51-H4: un conteo intermedio negativo es basura financiera — jamás se
  // persiste (el cashDiff se inflaría en el desglose por tramo).
  if (interimCountCents !== null && Number.isNaN(interimCountCents)) {
    return { status: 422, body: { code: 'INTERIM_COUNT_INVALID' } };
  }
  if (interimCountCents !== null && interimCountCents < 0) {
    return { status: 422, body: { code: 'INTERIM_COUNT_INVALID' } };
  }
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
    branchId: actor.branchId,
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
