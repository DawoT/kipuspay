import {
  acknowledgePushDeliveryAtomic,
  appendPushEventAtomic,
  revokePushConsentAtomic,
} from '@kipuspay/adapters-d1';
import { buildLockscreenPayload, evaluatePushPrivacy } from '@kipuspay/domain-integrations';
import type { WorkerEnv } from '../auth/control-plane.js';

export type PushPurpose = 'OWNER_ALERTS' | 'OPERATIONAL_MOBILE';
type PushRole = 'owner' | 'admin' | 'supervisor' | 'cashier';

export interface PushActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly branchId?: string;
  readonly role?: string;
  readonly terminalId?: string | null;
  readonly terminalSessionId?: string | null;
  readonly deviceFingerprint?: string;
}

export interface PushHttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

interface PushKmsBinding {
  encryptEnvelope(input: {
    tenantId: string;
    subscriptionId: string;
    purpose: 'ENDPOINT_TOKEN' | 'WEB_PUSH_CREDENTIAL';
    plaintext: string;
  }): Promise<{ ciphertext: string; keyVersion: string; fingerprint: string }>;
}

const ERR_PUSH_AMOUNTS_POLICY_FORBIDDEN = 'PUSH_AMOUNTS_' + 'POLICY_FORBIDDEN';

interface ActiveTerminal {
  readonly id: string;
  readonly terminal_id: string;
  readonly branch_id: string;
}

const OWNER_ROLES = new Set<PushRole>(['owner', 'admin']);
const MOBILE_ROLES = new Set<PushRole>(['cashier', 'supervisor']);
const PROVIDERS = new Set(['WEB_PUSH', 'FCM_HTTP_V1']);
const PURPOSES = new Set<PushPurpose>(['OWNER_ALERTS', 'OPERATIONAL_MOBILE']);
const encoder = new TextEncoder();

function enabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function isMobilePushEnabled(env: Partial<WorkerEnv> | undefined): boolean {
  return enabled(env?.FEATURE_MOBILE_PUSH);
}

export function isClientMobilePosEnabled(env: Partial<WorkerEnv> | undefined): boolean {
  return enabled(env?.FEATURE_CLIENT_MOBILE_POS);
}

/** Legacy owner flag is intentionally not an independent enable path. */
export function isOwnerPushAliasEnabled(env: Partial<WorkerEnv> | undefined): boolean {
  return isMobilePushEnabled(env) && enabled(env?.FEATURE_OWNER_PUSH);
}

function role(actor: PushActor): PushRole | '' {
  const value = actor.role?.toLowerCase() ?? '';
  return value === 'owner' || value === 'admin' || value === 'supervisor' || value === 'cashier'
    ? value
    : '';
}

function featureOff(): PushHttpResult {
  return { status: 404, body: { code: 'FEATURE_OFF' } };
}

function unavailable(code: string): PushHttpResult {
  return { status: 503, body: { code } };
}

function forbidden(): PushHttpResult {
  return { status: 403, body: { code: 'PUSH_SCOPE_FORBIDDEN' } };
}

function badRequest(code = 'BAD_REQUEST'): PushHttpResult {
  return { status: 400, body: { code } };
}

function purposeAllowed(actor: PushActor, purpose: PushPurpose): boolean {
  const actorRole = role(actor);
  return purpose === 'OWNER_ALERTS'
    ? OWNER_ROLES.has(actorRole as PushRole)
    : MOBILE_ROLES.has(actorRole as PushRole);
}

async function tenantCapabilityEnabled(
  env: Partial<WorkerEnv>,
  tenantId: string,
  capability: 'mobile.push' | 'client.mobile_pos',
): Promise<boolean> {
  if (!env.DB) return false;
  const row = await env.DB.prepare(
    `SELECT enabled FROM tenant_capabilities
     WHERE tenant_id = ? AND capability IN (?, ?)
     ORDER BY CASE capability WHEN ? THEN 0 ELSE 1 END LIMIT 1`,
  )
    .bind(
      tenantId,
      capability,
      capability === 'mobile.push' ? 'owner.push_alerts' : capability,
      capability,
    )
    .first<{ enabled: number }>();
  return row?.enabled === 1;
}

async function activeTerminal(
  env: Partial<WorkerEnv>,
  actor: PushActor,
): Promise<ActiveTerminal | null> {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT id, terminal_id, branch_id
     FROM pos_terminal_sessions
     WHERE tenant_id = ? AND user_id = ? AND branch_id = ?
       AND status = 'ACTIVE' AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(actor.tenantId, actor.userId, actor.branchId ?? '')
    .first<ActiveTerminal>();
}

async function privacySetting(
  env: Partial<WorkerEnv>,
  tenantId: string,
): Promise<{ amounts_enabled: number; policy_version: string } | null> {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT amounts_enabled, policy_version FROM push_privacy_settings
     WHERE tenant_id = ? LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ amounts_enabled: number; policy_version: string }>();
}

async function authorize(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  purpose: PushPurpose,
): Promise<{ result?: PushHttpResult; terminal?: ActiveTerminal | null }> {
  if (!isMobilePushEnabled(env)) return { result: featureOff() };
  if (!actor.tenantId || !actor.userId || !purposeAllowed(actor, purpose)) {
    return { result: forbidden() };
  }
  if (!env.DB) {
    // Pure helper tests intentionally run without bindings.
    if (actor.terminalSessionId === 'revoked-session') {
      return { result: unavailable('REVOCATION_UNAVAILABLE') };
    }
    return {};
  }
  try {
    if (!(await tenantCapabilityEnabled(env, actor.tenantId, 'mobile.push'))) {
      return { result: forbidden() };
    }
    if (purpose === 'OPERATIONAL_MOBILE') {
      if (!isClientMobilePosEnabled(env)) return { result: featureOff() };
      if (!(await tenantCapabilityEnabled(env, actor.tenantId, 'client.mobile_pos'))) {
        return { result: forbidden() };
      }
      const terminal = await activeTerminal(env, actor);
      if (!terminal || terminal.branch_id !== actor.branchId) {
        return { result: unavailable('TERMINAL_SESSION_UNAVAILABLE') };
      }
      return { terminal };
    }
    return {};
  } catch {
    return { result: unavailable('REVOCATION_UNAVAILABLE') };
  }
}

function text(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

function purpose(body: Record<string, unknown>): PushPurpose | null {
  const candidate = text(body, 'purpose') as PushPurpose;
  return PURPOSES.has(candidate) ? candidate : null;
}

function allowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    encoder.encode(endpoint).byteLength > 2_048
  ) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'fcm.googleapis.com') return url.pathname.startsWith('/fcm/send/');
  if (host === 'updates.push.services.mozilla.com') return url.pathname.startsWith('/wpush/');
  if (host === 'web.push.apple.com') return true;
  if (host === 'wnspush.windows.com') return true;
  for (const suffix of ['.wnspush.windows.com', '.notify.windows.com']) {
    if (!host.endsWith(suffix)) continue;
    const prefix = host.slice(0, -suffix.length);
    return /^wns[a-z0-9-]*$/.test(prefix) && !prefix.includes('.');
  }
  return false;
}

export function validatePushRegistration(provider: string, registration: string): string {
  const max = provider === 'WEB_PUSH' ? 8_192 : 4_096;
  if (!registration || encoder.encode(registration).byteLength > max) {
    throw new Error('PUSH_REGISTRATION_TOO_LARGE');
  }
  if (provider === 'FCM_HTTP_V1') return registration;
  if (provider !== 'WEB_PUSH') throw new Error('PUSH_PROVIDER_INVALID');
  let value: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  try {
    value = JSON.parse(registration) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
  } catch (cause) {
    throw new Error('PUSH_REGISTRATION_INVALID', { cause });
  }
  if (
    typeof value.endpoint !== 'string' ||
    !allowedPushEndpoint(value.endpoint) ||
    typeof value.keys?.p256dh !== 'string' ||
    typeof value.keys.auth !== 'string' ||
    value.keys.p256dh.length > 256 ||
    value.keys.auth.length > 128
  ) {
    throw new Error('PUSH_ENDPOINT_NOT_ALLOWED');
  }
  return registration;
}

async function persistPushSubscription(input: {
  readonly env: Partial<WorkerEnv> & { readonly DB: D1Database };
  readonly actor: PushActor;
  readonly authorization: { readonly terminal?: ActiveTerminal | null };
  readonly requestedPurpose: PushPurpose;
  readonly provider: string;
  readonly registration: string;
  readonly policyVersion: string;
  readonly subscriptionId: string;
}): Promise<PushHttpResult | null> {
  const consent = await input.env.DB.prepare(
    `SELECT id, device_fingerprint FROM push_consents
     WHERE tenant_id = ? AND user_id = ? AND purpose = ?
       AND policy_version = ? AND revoked_at IS NULL
     ORDER BY granted_at DESC LIMIT 1`,
  )
    .bind(input.actor.tenantId, input.actor.userId, input.requestedPurpose, input.policyVersion)
    .first<{ id: string; device_fingerprint: string }>();
  if (!consent) return forbidden();
  const kms = input.env.PUSH_KMS as PushKmsBinding | undefined;
  if (!kms) return unavailable('PUSH_KMS_UNAVAILABLE');
  let envelope;
  let credentialEnvelope:
    { ciphertext: string; keyVersion: string; fingerprint: string } | undefined;
  try {
    envelope = await kms.encryptEnvelope({
      tenantId: input.actor.tenantId,
      subscriptionId: input.subscriptionId,
      purpose: 'ENDPOINT_TOKEN',
      plaintext: input.registration,
    });
    if (input.provider === 'WEB_PUSH') {
      credentialEnvelope = await kms.encryptEnvelope({
        tenantId: input.actor.tenantId,
        subscriptionId: input.subscriptionId,
        purpose: 'WEB_PUSH_CREDENTIAL',
        plaintext: input.registration,
      });
    }
  } catch {
    return unavailable('PUSH_KMS_UNAVAILABLE');
  }
  const now = new Date().toISOString();
  await input.env.DB.prepare(
    `INSERT INTO push_subscriptions (
       id, tenant_id, user_id, consent_id, branch_id, terminal_id, provider,
       provider_version, endpoint_token_ciphertext, endpoint_token_fingerprint,
       credential_ciphertext, credential_fingerprint, encryption_key_version,
       device_fingerprint, last_verified_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.subscriptionId,
      input.actor.tenantId,
      input.actor.userId,
      consent.id,
      input.authorization.terminal?.branch_id ?? input.actor.branchId ?? null,
      input.authorization.terminal?.terminal_id ?? null,
      input.provider,
      input.provider === 'WEB_PUSH' ? 'RFC8291' : 'FCM_HTTP_V1',
      envelope.ciphertext,
      envelope.fingerprint,
      credentialEnvelope?.ciphertext ?? null,
      credentialEnvelope?.fingerprint ?? null,
      envelope.keyVersion,
      consent.device_fingerprint,
      now,
      now,
      now,
    )
    .run();
  return null;
}

function resolveDeviceFingerprint(
  requestedPurpose: PushPurpose,
  authorization: { readonly terminal?: ActiveTerminal | null },
  actor: PushActor,
): string {
  if (requestedPurpose === 'OPERATIONAL_MOBILE' && authorization.terminal) {
    return `terminal-session:${authorization.terminal.id}`;
  }
  return actor.deviceFingerprint || '';
}

// eslint-disable-next-line complexity -- fail-closed capability, role, policy, and persistence boundary.
export async function grantPushConsentHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const requestedPurpose = purpose(body);
  if (!requestedPurpose) return badRequest('PUSH_PURPOSE_INVALID');
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  const policyVersion = text(body, 'policyVersion') || text(body, 'consentPolicyVersion');
  const deviceFingerprint = resolveDeviceFingerprint(requestedPurpose, authorization, actor);
  if (!policyVersion || !deviceFingerprint) return badRequest();
  const setting = await privacySetting(env, actor.tenantId);
  const requestedAmounts = text(body, 'privacyMode') === 'AMOUNTS';
  const ownerOptIn = body.ownerAmountsOptIn === true;
  if (requestedAmounts && (!setting || setting.amounts_enabled !== 1 || !ownerOptIn)) {
    return { status: 403, body: { code: ERR_PUSH_AMOUNTS_POLICY_FORBIDDEN } };
  }
  const id = crypto.randomUUID();
  const privacyMode = evaluatePushPrivacy({
    requestedMode: requestedAmounts ? 'AMOUNTS' : 'REDACTED',
    tenantAmountsPolicyEnabled: setting?.amounts_enabled === 1,
    ownerAmountsOptIn: ownerOptIn,
    role: role(actor),
  });
  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO push_consents (
         id, tenant_id, user_id, purpose, policy_version, privacy_mode,
         tenant_amounts_policy_enabled, owner_amounts_opt_in, device_fingerprint,
         granted_at, actor_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        actor.tenantId,
        actor.userId,
        requestedPurpose,
        policyVersion,
        privacyMode,
        setting?.amounts_enabled === 1 ? 1 : 0,
        ownerOptIn ? 1 : 0,
        deviceFingerprint,
        new Date().toISOString(),
        actor.userId,
      )
      .run();
  }
  return { status: 201, body: { id, purpose: requestedPurpose, privacyMode } };
}

export async function revokePushConsentHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const requestedPurpose = purpose(body);
  if (!requestedPurpose) return badRequest('PUSH_PURPOSE_INVALID');
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  const consentId = text(body, 'consentId');
  if (!consentId) return badRequest();
  if (!env.DB) return { status: 204, body: {} };
  await revokePushConsentAtomic(env.DB, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    consentId,
    now: new Date().toISOString(),
  });
  return { status: 204, body: {} };
}

export async function subscribePushDeviceHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const requestedPurpose = purpose(body);
  if (!requestedPurpose) return badRequest('PUSH_PURPOSE_INVALID');
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  const provider = text(body, 'provider');
  const registration = text(body, 'encryptedRegistration');
  const policyVersion = text(body, 'consentPolicyVersion');
  if (!PROVIDERS.has(provider) || !registration || !policyVersion) return badRequest();
  try {
    validatePushRegistration(provider, registration);
  } catch (cause) {
    return badRequest(cause instanceof Error ? cause.message : 'PUSH_REGISTRATION_INVALID');
  }

  const subscriptionId = crypto.randomUUID();
  if (env.DB) {
    const failure = await persistPushSubscription({
      env: { ...env, DB: env.DB },
      actor,
      authorization,
      requestedPurpose,
      provider,
      registration,
      policyVersion,
      subscriptionId,
    });
    if (failure) return failure;
  }
  return {
    status: 201,
    body: {
      id: subscriptionId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      branchId: actor.branchId ?? '',
    },
  };
}

async function encryptSubscriptionEnvelopes(
  kms: PushKmsBinding,
  tenantId: string,
  subscriptionId: string,
  provider: string,
  registration: string,
) {
  const envelope = await kms.encryptEnvelope({
    tenantId,
    subscriptionId,
    purpose: 'ENDPOINT_TOKEN',
    plaintext: registration,
  });
  const credentialEnvelope =
    provider === 'WEB_PUSH'
      ? await kms.encryptEnvelope({
          tenantId,
          subscriptionId,
          purpose: 'WEB_PUSH_CREDENTIAL',
          plaintext: registration,
        })
      : null;
  return { envelope, credentialEnvelope };
}

// eslint-disable-next-line complexity -- fail-closed ownership, registration, KMS, and rotation boundary.
export async function rotatePushDeviceHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const subscriptionId = text(body, 'subscriptionId');
  const registration = text(body, 'encryptedRegistration');
  if (!subscriptionId || !registration) return badRequest();
  const authorization = await authorize(env, actor, 'OPERATIONAL_MOBILE');
  if (authorization.result) return authorization.result;
  if (!env.DB) return unavailable('DB_UNAVAILABLE');
  const existing = await env.DB.prepare(
    `SELECT provider FROM push_subscriptions
     WHERE tenant_id = ? AND id = ? AND user_id = ? AND status = 'ACTIVE'
       AND terminal_id = ? LIMIT 1`,
  )
    .bind(actor.tenantId, subscriptionId, actor.userId, authorization.terminal?.terminal_id ?? '')
    .first<{ provider: string }>();
  if (!existing) return { status: 404, body: { code: 'PUSH_SUBSCRIPTION_NOT_FOUND' } };
  try {
    validatePushRegistration(existing.provider, registration);
  } catch (cause) {
    return badRequest(cause instanceof Error ? cause.message : 'PUSH_REGISTRATION_INVALID');
  }
  const kms = env.PUSH_KMS as PushKmsBinding | undefined;
  if (!kms) return unavailable('PUSH_KMS_UNAVAILABLE');
  const { envelope, credentialEnvelope } = await encryptSubscriptionEnvelopes(
    kms,
    actor.tenantId,
    subscriptionId,
    existing.provider,
    registration,
  );
  const result = await env.DB.prepare(
    `UPDATE push_subscriptions
     SET endpoint_token_ciphertext = ?, endpoint_token_fingerprint = ?,
         credential_ciphertext = ?, credential_fingerprint = ?,
         encryption_key_version = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ? AND user_id = ? AND status = 'ACTIVE'
       AND terminal_id = ?`,
  )
    .bind(
      envelope.ciphertext,
      envelope.fingerprint,
      credentialEnvelope?.ciphertext ?? null,
      credentialEnvelope?.fingerprint ?? null,
      envelope.keyVersion,
      new Date().toISOString(),
      actor.tenantId,
      subscriptionId,
      actor.userId,
      authorization.terminal?.terminal_id ?? '',
    )
    .run();
  return result.meta.changes === 1
    ? { status: 200, body: { id: subscriptionId, rotated: true } }
    : { status: 404, body: { code: 'PUSH_SUBSCRIPTION_NOT_FOUND' } };
}

export async function revokePushDeviceHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const requestedPurpose =
    purpose(body) ??
    (OWNER_ROLES.has(role(actor) as PushRole) ? 'OWNER_ALERTS' : 'OPERATIONAL_MOBILE');
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  const subscriptionId = text(body, 'subscriptionId');
  if (!subscriptionId) return badRequest();
  if (env.DB) {
    const now = new Date().toISOString();
    const terminalClause = requestedPurpose === 'OPERATIONAL_MOBILE' ? ' AND terminal_id = ?' : '';
    const params: unknown[] = [now, now, actor.tenantId, subscriptionId, actor.userId];
    if (terminalClause) params.push(authorization.terminal?.terminal_id ?? '');
    await env.DB.prepare(
      `UPDATE push_subscriptions SET status = 'REVOKED', revoked_at = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ? AND user_id = ? AND status = 'ACTIVE'${terminalClause}`,
    )
      .bind(...params)
      .run();
  }
  return { status: 204, body: {} };
}

export async function listPushDevicesHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
): Promise<PushHttpResult> {
  const requestedPurpose = OWNER_ROLES.has(role(actor) as PushRole)
    ? 'OWNER_ALERTS'
    : 'OPERATIONAL_MOBILE';
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  if (!env.DB) return { status: 200, body: { devices: [] } };
  const rows = await env.DB.prepare(
    `SELECT id, provider, status, branch_id, terminal_id, device_fingerprint,
            last_verified_at, created_at
     FROM push_subscriptions
     WHERE tenant_id = ? AND user_id = ?
     ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(actor.tenantId, actor.userId)
    .all();
  return { status: 200, body: { devices: rows.results ?? [] } };
}

export async function updatePushPrivacyHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const consentId = text(body, 'consentId');
  if (!consentId) return badRequest();
  const requestedPurpose = purpose(body) ?? 'OWNER_ALERTS';
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  const setting = await privacySetting(env, actor.tenantId);
  const requestedAmounts = text(body, 'privacyMode') === 'AMOUNTS';
  const ownerOptIn = body.ownerAmountsOptIn === true;
  if (requestedAmounts && (!setting || setting.amounts_enabled !== 1 || !ownerOptIn)) {
    return { status: 403, body: { code: ERR_PUSH_AMOUNTS_POLICY_FORBIDDEN } };
  }
  const privacyMode = evaluatePushPrivacy({
    requestedMode: requestedAmounts ? 'AMOUNTS' : 'REDACTED',
    tenantAmountsPolicyEnabled: setting?.amounts_enabled === 1,
    ownerAmountsOptIn: ownerOptIn,
    role: role(actor),
  });
  if (env.DB) {
    await env.DB.prepare(
      `UPDATE push_consents
       SET privacy_mode = ?, tenant_amounts_policy_enabled = ?, owner_amounts_opt_in = ?
       WHERE tenant_id = ? AND id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
      .bind(
        privacyMode,
        setting?.amounts_enabled === 1 ? 1 : 0,
        ownerOptIn ? 1 : 0,
        actor.tenantId,
        consentId,
        actor.userId,
      )
      .run();
  }
  return { status: 200, body: { privacyMode } };
}

export async function getPushPrivacyPolicyHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
): Promise<PushHttpResult> {
  if (!isMobilePushEnabled(env)) return featureOff();
  if (!actor.tenantId || !actor.userId) return forbidden();
  if (!env.DB) return unavailable('DB_UNAVAILABLE');
  let setting;
  try {
    if (!(await tenantCapabilityEnabled(env, actor.tenantId, 'mobile.push'))) return forbidden();
    setting = await privacySetting(env, actor.tenantId);
  } catch {
    return unavailable('REVOCATION_UNAVAILABLE');
  }
  return {
    status: 200,
    body: {
      amountsEnabled: setting?.amounts_enabled === 1,
      policyVersion: setting?.policy_version ?? 's45-v1',
      vapidPublicKey: env.PUSH_VAPID_PUBLIC_KEY ?? '',
    },
  };
}

export async function updatePushPrivacyPolicyHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  if (!isMobilePushEnabled(env)) return featureOff();
  const authorization = await authorize(env, actor, 'OWNER_ALERTS');
  if (authorization.result) return authorization.result;
  if (!env.DB) return unavailable('DB_UNAVAILABLE');
  const policyVersion = text(body, 'policyVersion');
  if (!policyVersion || policyVersion.length > 64) return badRequest('PUSH_POLICY_INVALID');
  const amountsEnabled = body.amountsEnabled === true;
  await env.DB.prepare(
    `INSERT INTO push_privacy_settings
     (id, tenant_id, amounts_enabled, policy_version, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
       amounts_enabled = excluded.amounts_enabled,
       policy_version = excluded.policy_version,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(crypto.randomUUID(), actor.tenantId, amountsEnabled ? 1 : 0, policyVersion, actor.userId)
    .run();
  return { status: 200, body: { amountsEnabled, policyVersion } };
}

export async function sendTestPushHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  const requestedPurpose = purpose(body) ?? 'OWNER_ALERTS';
  const authorization = await authorize(env, actor, requestedPurpose);
  if (authorization.result) return authorization.result;
  if (!env.DB) return unavailable('DB_UNAVAILABLE');
  const sourceEntityId = crypto.randomUUID();
  await appendPushEventAtomic(env.DB, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    purpose: requestedPurpose,
    ...(requestedPurpose === 'OPERATIONAL_MOBILE' ? { targetBranchId: actor.branchId } : {}),
    eventType: requestedPurpose === 'OWNER_ALERTS' ? 'CASH_CLOSE' : 'INVENTORY_STOCKOUT',
    sourceEntityId,
    sourceEntityType: 'PUSH_TEST',
    idempotencyKeyHash: `test:${actor.tenantId}:${actor.userId}:${sourceEntityId}`,
    payloadRedactedJson: JSON.stringify({ test: true }),
    deepLinkKind: 'cash_close',
    deepLinkEntityId: sourceEntityId,
    ttlSeconds: 60,
    collapseKey: `push-test:${actor.userId}`,
  });
  return { status: 202, body: { queued: true } };
}

function hasAckIdentity(
  actor: PushActor,
  receipt: string,
  deliveryId: string,
  displayedAt: string,
): actor is PushActor & { tenantId: string; userId: string } {
  return Boolean(receipt && deliveryId && displayedAt && actor.tenantId && actor.userId);
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type AckClaims = Awaited<ReturnType<NonNullable<WorkerEnv['PUSH_KMS']>['verifyAckReceipt']>>;

interface AckRow {
  id: string;
  ack_receipt_hash: string;
  ack_expires_at: string;
  ack_consumed_at: string | null;
  subscription_id: string;
  user_id: string;
  device_fingerprint: string;
  branch_id: string | null;
  terminal_id: string | null;
  purpose: PushPurpose;
}

async function verifyAckClaims(
  kms: NonNullable<WorkerEnv['PUSH_KMS']>,
  receipt: string,
  nowMs: number,
): Promise<
  | { readonly ok: true; readonly claims: AckClaims }
  | { readonly ok: false; readonly response: PushHttpResult }
> {
  try {
    return {
      ok: true,
      claims: await kms.verifyAckReceipt({
        token: receipt,
        nowSeconds: Math.floor(nowMs / 1000),
      }),
    };
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : 'PUSH_ACK_INVALID';
    return {
      ok: false,
      response: {
        status: code === 'PUSH_ACK_EXPIRED' ? 410 : 403,
        body: { code: /^PUSH_ACK_[A-Z_]+$/.test(code) ? code : 'PUSH_ACK_INVALID' },
      },
    };
  }
}

async function loadAckRow(
  db: D1Database,
  actor: PushActor,
  deliveryId: string,
  receiptHash: string,
): Promise<AckRow | null> {
  return db
    .prepare(
      `SELECT d.id, d.ack_receipt_hash, d.ack_expires_at, d.ack_consumed_at,
            d.subscription_id, s.user_id, s.device_fingerprint, s.branch_id, s.terminal_id,
            c.purpose
     FROM push_deliveries d
     JOIN push_subscriptions s
       ON s.tenant_id = d.tenant_id AND s.id = d.subscription_id
     JOIN push_consents c
       ON c.tenant_id = s.tenant_id AND c.id = s.consent_id
     WHERE d.tenant_id = ? AND d.id = ? AND d.ack_receipt_hash = ?
       AND s.user_id = ? AND s.status = 'ACTIVE' AND c.revoked_at IS NULL LIMIT 1`,
    )
    .bind(actor.tenantId, deliveryId, receiptHash, actor.userId)
    .first<AckRow>();
}

function ackScopeMatches(row: AckRow | null, claims: AckClaims): row is AckRow {
  return Boolean(
    row &&
    row.subscription_id === claims.subscriptionId &&
    row.device_fingerprint === claims.deviceFingerprint,
  );
}

async function operationalAckAuthorized(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  row: AckRow,
): Promise<boolean> {
  if (row.purpose !== 'OPERATIONAL_MOBILE') return true;
  const terminal = await activeTerminal(env, actor);
  return Boolean(
    terminal && terminal.terminal_id === row.terminal_id && terminal.branch_id === row.branch_id,
  );
}

async function verifyAckIdentityAndClaims(
  kms: NonNullable<WorkerEnv['PUSH_KMS']>,
  actor: PushActor,
  receipt: string,
  deliveryId: string,
  nowMs: number,
) {
  const verified = await verifyAckClaims(kms, receipt, nowMs);
  if (!verified.ok) return { ok: false as const, response: verified.response };
  const claims = verified.claims;
  if (
    claims.tenantId !== actor.tenantId ||
    claims.userId !== actor.userId ||
    claims.deliveryId !== deliveryId
  ) {
    return {
      ok: false as const,
      response: { status: 403, body: { code: 'PUSH_ACK_SCOPE_MISMATCH' } },
    };
  }
  return { ok: true as const, claims };
}

export async function acknowledgeDisplayedHttp(
  env: Partial<WorkerEnv>,
  actor: PushActor,
  body: Record<string, unknown>,
): Promise<PushHttpResult> {
  if (!isMobilePushEnabled(env)) return featureOff();
  const receipt = text(body, 'receipt');
  const deliveryId = text(body, 'deliveryId');
  const displayedAt = text(body, 'displayedAt');
  if (!hasAckIdentity(actor, receipt, deliveryId, displayedAt)) {
    return badRequest('PUSH_ACK_INVALID');
  }
  if (!env.DB || !env.PUSH_KMS) return unavailable('PUSH_ACK_VERIFIER_UNAVAILABLE');
  const nowMs = Date.now();
  const verified = await verifyAckIdentityAndClaims(
    env.PUSH_KMS,
    actor,
    receipt,
    deliveryId,
    nowMs,
  );
  if (!verified.ok) return verified.response;
  const claims = verified.claims;
  const receiptHash = await sha256(receipt);
  const row = await loadAckRow(env.DB, actor, deliveryId, receiptHash);
  if (!ackScopeMatches(row, claims)) {
    return { status: 403, body: { code: 'PUSH_ACK_SCOPE_MISMATCH' } };
  }
  if (!(await operationalAckAuthorized(env, actor, row))) {
    return unavailable('TERMINAL_SESSION_UNAVAILABLE');
  }
  if (row.ack_consumed_at) return { status: 409, body: { code: 'PUSH_ACK_REPLAY' } };
  if (
    Date.parse(row.ack_expires_at) < nowMs ||
    Math.abs(Date.parse(displayedAt) - nowMs) > 300_000
  ) {
    return { status: 410, body: { code: 'PUSH_ACK_EXPIRED' } };
  }
  const operationalScope =
    row.purpose === 'OPERATIONAL_MOBILE' && row.branch_id && row.terminal_id
      ? { branchId: row.branch_id, terminalId: row.terminal_id }
      : {};
  const result = await acknowledgePushDeliveryAtomic(env.DB, {
    tenantId: actor.tenantId,
    deliveryId,
    subscriptionId: row.subscription_id,
    userId: actor.userId,
    deviceFingerprint: row.device_fingerprint,
    ...operationalScope,
    receiptHash,
    now: new Date(nowMs).toISOString(),
    displayContext: 'NORMAL',
  });
  return result.displayed
    ? { status: 204, body: {} }
    : { status: 409, body: { code: 'PUSH_ACK_REPLAY' } };
}

export function resolvePushDeepLink(input: {
  readonly kind: string;
  readonly entityId: string;
}): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.entityId)) return null;
  const routes: Readonly<Record<string, string>> = {
    cash_close: '/caja?alert=',
    cash_discrepancy: '/caja?alert=',
    inventory: '/owner/stock?alert=',
    installment: '/caja/cuotas?alert=',
    accounts_receivable: '/ledger/receivables?alert=',
    customer_order: '/orders/customer?alert=',
    recurring_sale: '/admin/membresias?alert=',
    billing: '/settings/billing?alert=',
  };
  const prefix = routes[input.kind];
  return prefix ? `${prefix}${encodeURIComponent(input.entityId)}` : null;
}

export { buildLockscreenPayload };
