import {
  configureTenantWeightPolicy,
  createWeightOverrideAuthorization,
  diagnoseScaleDevice,
  disableScaleDevice,
  listScaleDevices,
  registerScaleDevice,
  registerTerminalSession,
  resolveActiveTerminalSession,
  submitWeightMeasurementAtomic,
  writeScaleHeartbeat,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isInventoryScaleEnabled } from '../auth/features.js';

export { isInventoryScaleEnabled };

interface ScaleActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly terminalId: string;
  readonly terminalSessionId: string;
}

interface ScaleHttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const ADMIN_ROLES = new Set(['admin', 'owner']);
const SCALE_ERROR_STATUS: Readonly<Record<string, number>> = {
  SCALE_DEVICE_NOT_FOUND: 404,
  SCALE_TERMINAL_NOT_FOUND: 404,
  SCALE_DEVICE_SWITCH_REQUIRES_DISABLE: 409,
  SCALE_PROTOCOL_NOT_ALLOWED: 422,
  SCALE_PROFILE_NOT_ALLOWED: 422,
  WEIGHT_POLICY_INVALID: 422,
  WEIGHT_OVERRIDE_REQUIRED: 403,
  WEIGHT_OVERRIDE_EXPIRED: 403,
  WEIGHT_OVERRIDE_SCOPE_INVALID: 403,
  WEIGHT_OVERRIDE_ALREADY_USED: 403,
  SCALE_HEARTBEAT_STALE: 422,
  INVALID_WEIGHT_FACTS: 400,
  TERMINAL_SESSION_TARGET_INVALID: 403,
  SCALE_DEVICE_SCOPE_MISMATCH: 403,
  SCALE_HEARTBEAT_PROTOCOL_MISMATCH: 409,
  SCALE_HEARTBEAT_REORDERED: 409,
};

function safeFailure(error: unknown): ScaleHttpResult {
  const code = error instanceof Error ? error.message : '';
  if (code === 'TERMINAL_SESSION_FORBIDDEN') {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  const status = SCALE_ERROR_STATUS[code];
  return status ? { status, body: { code } } : { status: 500, body: { code: 'INTERNAL_ERROR' } };
}

function preflight(env: WorkerEnv, actor: ScaleActor): ScaleHttpResult | null {
  if (!isInventoryScaleEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!actor.tenantId || !actor.userId || !actor.terminalId || !actor.terminalSessionId) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  if (!env.DB) return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  return null;
}

async function requireActorBinding(env: WorkerEnv, actor: ScaleActor) {
  return resolveActiveTerminalSession(env.DB!, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    terminalId: actor.terminalId,
    terminalSessionId: actor.terminalSessionId,
  });
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function integer(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

// eslint-disable-next-line complexity -- strict DTO whitelist and transport union validation
export async function runSubmitWeightHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  const measurementId = text(body, 'measurementId');
  const saleItemId = text(body, 'saleItemId');
  const productId = text(body, 'productId');
  const weightMicrounits = integer(body, 'weightMicrounits');
  const source = text(body, 'measurementSource');
  if (
    !measurementId ||
    !saleItemId ||
    !productId ||
    weightMicrounits === null ||
    weightMicrounits <= 0 ||
    (source !== 'DEVICE' && source !== 'MANUAL')
  ) {
    return { status: 400, body: { code: 'INVALID_WEIGHT_FACTS' } };
  }
  try {
    const binding = await requireActorBinding(env, actor);
    const protocol = text(body, 'scaleProtocol');
    const result = await submitWeightMeasurementAtomic(env.DB!, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      terminalId: binding.terminalId,
      saleItemId,
      productId,
      measurementId,
      weightMicrounits,
      measurementSource: source,
      ...(protocol === 'WEBHID' || protocol === 'WEB_SERIAL' || protocol === 'WEBUSB'
        ? { scaleProtocol: protocol }
        : {}),
      ...(text(body, 'scaleDeviceId') ? { scaleDeviceId: text(body, 'scaleDeviceId') } : {}),
      ...(integer(body, 'heartbeatSequence') !== null
        ? { heartbeatSequence: integer(body, 'heartbeatSequence')! }
        : {}),
      ...(text(body, 'observedAt') ? { observedAt: text(body, 'observedAt') } : {}),
      ...(text(body, 'offlineSaleId') ? { offlineSaleId: text(body, 'offlineSaleId') } : {}),
      ...(text(body, 'authorizationToken')
        ? { authorizationToken: text(body, 'authorizationToken') }
        : {}),
    });
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runAuthorizeManualWeightHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  if (!isInventoryScaleEnabled(env)) {
    return { status: 404, body: { code: 'FEATURE_OFF' } };
  }
  if (!['supervisor', 'admin', 'owner'].includes(actor.role)) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  if (!env.DB) return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  const offlineSaleId = text(body, 'offlineSaleId');
  const saleItemId = text(body, 'saleItemId');
  const measurementId = text(body, 'measurementId');
  const consumingActorUserId = text(body, 'consumingActorUserId');
  const terminalSessionId = text(body, 'terminalSessionId');
  if (
    !actor.tenantId ||
    !actor.userId ||
    !actor.terminalId ||
    !offlineSaleId ||
    !saleItemId ||
    !measurementId ||
    !consumingActorUserId ||
    !terminalSessionId
  ) {
    return { status: 400, body: { code: 'INVALID_WEIGHT_OVERRIDE_SCOPE' } };
  }
  try {
    const binding = await resolveActiveTerminalSession(env.DB, {
      tenantId: actor.tenantId,
      userId: consumingActorUserId,
      terminalId: actor.terminalId,
      terminalSessionId,
    });
    const result = await createWeightOverrideAuthorization(env.DB, {
      action: 'WEIGHT_OVERRIDE',
      tenantId: actor.tenantId,
      actorUserId: binding.userId,
      approvedByUserId: actor.userId,
      terminalId: binding.terminalId,
      offlineSaleId,
      saleItemId,
      measurementId,
      ttlSeconds: 90,
    });
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runConfigureWeightPolicyHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  if (!ADMIN_ROLES.has(actor.role)) return { status: 403, body: { code: 'FORBIDDEN' } };
  // eslint-disable-next-line no-secrets/no-secrets -- public DTO field, not a credential
  const threshold = integer(body, 'manualWeightThresholdMicrounits');
  if (threshold === null || threshold < 0) {
    return { status: 400, body: { code: 'INVALID_WEIGHT_POLICY' } };
  }
  try {
    await requireActorBinding(env, actor);
    const result = await configureTenantWeightPolicy(env.DB!, {
      tenantId: actor.tenantId,
      manualWeightThresholdMicrounits: threshold,
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runRegisterScaleDeviceHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  if (!ADMIN_ROLES.has(actor.role)) return { status: 403, body: { code: 'FORBIDDEN' } };
  const protocol = text(body, 'protocol');
  const profile = body.profile;
  if (
    !['WEBHID', 'WEB_SERIAL', 'WEBUSB'].includes(protocol) ||
    !profile ||
    typeof profile !== 'object' ||
    Array.isArray(profile)
  ) {
    return { status: 400, body: { code: 'INVALID_SCALE_DEVICE' } };
  }
  try {
    const binding = await requireActorBinding(env, actor);
    const result = await registerScaleDevice(env.DB!, {
      tenantId: actor.tenantId,
      terminalId: binding.terminalId,
      protocol: protocol as 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB',
      deviceFingerprint: text(body, 'deviceFingerprint'),
      profile: profile as {
        profileId: string;
        vendorId: number;
        productId: number;
        reportId?: number;
        endpoint?: number;
        baudRate?: number;
      },
    });
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runListScaleDevicesHttp(
  env: WorkerEnv,
  actor: ScaleActor,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  if (!['supervisor', 'admin', 'owner'].includes(actor.role)) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  try {
    const binding = await requireActorBinding(env, actor);
    const devices = await listScaleDevices(env.DB!, {
      tenantId: actor.tenantId,
      terminalId: binding.terminalId,
    });
    return { status: 200, body: { devices } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runDiagnoseScaleDeviceHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  try {
    const binding = await requireActorBinding(env, actor);
    const device = await diagnoseScaleDevice(env.DB!, {
      tenantId: actor.tenantId,
      terminalId: binding.terminalId,
      deviceId: text(body, 'deviceId'),
    });
    return { status: 200, body: { device } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runDisableScaleDeviceHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  if (!ADMIN_ROLES.has(actor.role)) return { status: 403, body: { code: 'FORBIDDEN' } };
  try {
    const binding = await requireActorBinding(env, actor);
    const result = await disableScaleDevice(env.DB!, {
      tenantId: actor.tenantId,
      terminalId: binding.terminalId,
      deviceId: text(body, 'deviceId'),
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runRegisterTerminalSessionHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  if (!isInventoryScaleEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!actor.tenantId || !actor.userId || !ADMIN_ROLES.has(actor.role)) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  if (!env.DB) return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  const terminalId = text(body, 'terminalId');
  const cashRegisterSessionId = text(body, 'cashRegisterSessionId');
  const userId = text(body, 'userId');
  if (!terminalId || !cashRegisterSessionId || !userId) {
    return { status: 400, body: { code: 'INVALID_TERMINAL_SESSION' } };
  }
  try {
    const result = await registerTerminalSession(env.DB, {
      tenantId: actor.tenantId,
      terminalId,
      cashRegisterSessionId,
      userId,
    });
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runHeartbeatScaleDeviceHttp(
  env: WorkerEnv,
  actor: ScaleActor,
  body: Record<string, unknown>,
): Promise<ScaleHttpResult> {
  const denied = preflight(env, actor);
  if (denied) return denied;
  const protocol = text(body, 'protocol');
  const heartbeatSequence = integer(body, 'heartbeatSequence');
  if (
    !text(body, 'deviceId') ||
    !text(body, 'observedAt') ||
    heartbeatSequence === null ||
    !['WEBHID', 'WEB_SERIAL', 'WEBUSB'].includes(protocol)
  ) {
    return { status: 400, body: { code: 'INVALID_HEARTBEAT' } };
  }
  try {
    const binding = await requireActorBinding(env, actor);
    const result = await writeScaleHeartbeat(env.DB!, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      terminalId: binding.terminalId,
      terminalSessionId: binding.terminalSessionId,
      cashRegisterSessionId: binding.cashRegisterSessionId,
      branchId: binding.branchId,
      deviceId: text(body, 'deviceId'),
      protocol: protocol as 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB',
      heartbeatSequence,
      observedAt: text(body, 'observedAt'),
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}
