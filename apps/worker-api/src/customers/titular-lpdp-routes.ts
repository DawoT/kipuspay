/**
 * Sprint C3 — LPDP ARCO self-serve del titular (regla 32a / GTM-09).
 * El titular ejercita sus derechos (LPDP-01/02/03) verificando identidad con
 * datos (tienda + DNI + nombre + teléfono) y OTP al correo registrado para
 * recibir un token de titular de corta duración (scope `lpdp_titular`). El token jamás habilita el panel
 * admin (requireAdmin) ni la PII de otro titular (LPDP-04: tenant/customer
 * siempre del claim verificado, nunca del payload).
 */
import { eraseCustomer, exportCustomer, listConsents, writeConsent } from '@kipuspay/adapters-d1';
import { verifyJwt, signHs256 } from '../auth/verify-jwt.js';
import type { WorkerEnv } from '../auth/control-plane.js';
import type { HttpResult } from '../auth/plan-cadena.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export interface TitularTokenClaims {
  readonly tenantId: string;
  readonly customerId: string;
  readonly scope: 'lpdp_titular';
}

const TITULAR_TTL_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SHARD_COUNT = 64;
const NETWORK_VERIFY_LIMIT = 30;
const SUBJECT_VERIFY_LIMIT = 5;
const VERIFY_WINDOW_MS = 60 * 60 * 1000;
const OTP_FORMAT = /^\d{6}$/;

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_LPDP off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function lpdpKilled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_LPDP === '0';
}

async function requireLpdp(env: WorkerEnv, tenantId: string): Promise<HttpResult | null> {
  try {
    await new CapabilityResolver(env).require(tenantId, 'compliance.lpdp');
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

function mapErr(e: unknown): HttpResult {
  const msg = e instanceof Error ? e.message : String(e);
  const safe = new Set([
    'CUSTOMER_NOT_FOUND',
    'CUSTOMER_ERASED',
    'ALREADY_ERASED',
    'UNKNOWN_CONSENT_PURPOSE',
  ]);
  // LPDP-04: nunca devolver detalles del proveedor, SQL ni PII en un error
  // inesperado. Los códigos de dominio explícitamente allowlisted sí son
  // seguros para que el titular pueda actuar sobre ellos.
  if (!safe.has(msg))
    return { status: 500, body: { error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' } };
  return { status: 404, body: { error: msg, code: msg } };
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function parseIdentity(body: Record<string, unknown>): {
  tenantId: string;
  documentNumber: string;
  name: string;
  phone: string;
} | null {
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
  const documentNumber = typeof body.documentNumber === 'string' ? body.documentNumber.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!tenantId || !documentNumber || !name || !phone) return null;
  return { tenantId, documentNumber, name, phone };
}

function randomOtp(): string {
  const range = 1_000_000;
  const ceiling = Math.floor(0x1_0000_0000 / range) * range;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0]! >= ceiling);
  return String(value[0]! % range).padStart(6, '0');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function securityShard(env: WorkerEnv, digest: string) {
  if (!env.LPDP_OTP_STATE_DO) throw new Error('LPDP_OTP_STATE_UNAVAILABLE');
  const shard = Number.parseInt(digest.slice(0, 8), 16) % OTP_SHARD_COUNT;
  return env.LPDP_OTP_STATE_DO.getByName(`lpdp-security-v1:${shard}`);
}

async function securityDigest(env: WorkerEnv, purpose: string, value: string): Promise<string> {
  const secret = env.LPDP_OTP_HMAC_SECRET;
  if (!secret) throw new Error('LPDP_OTP_STATE_UNAVAILABLE');
  return hmacHex(secret, `${purpose}:v1:${value}`);
}

function verificationUnavailable(): HttpResult {
  return {
    status: 503,
    body: { error: 'Verification temporarily unavailable', code: 'VERIFICATION_UNAVAILABLE' },
  };
}

function genericOtpChallenge(challengeId: string): HttpResult {
  return {
    status: 202,
    body: {
      challengeId,
      expiresInSeconds: OTP_TTL_MS / 1000,
      message: 'Si los datos coinciden, enviaremos un código al correo asociado.',
    },
  };
}

/**
 * Verifica el Bearer del titular y devuelve los claims (LPDP-04). El
 * verifyJwt valida firma/exp/iat; el scope y el customerId se leen del
 * payload YA verificado (auténtico) — un JWT admin (scope ausente o
 * distinto) jamás pasa como titular.
 */
async function resolveTitular(
  env: WorkerEnv | undefined,
  authz: string,
): Promise<TitularTokenClaims | null> {
  if (!authz.startsWith('Bearer ')) return null;
  const token = authz.slice(7);
  const claims = await verifyJwt(env ?? {}, token);
  if (!claims || !claims.tenantId) return null;
  const payload = parseJwtPayload(token);
  if (!payload || payload.scope !== 'lpdp_titular') return null;
  const customerId = typeof payload.customerId === 'string' ? payload.customerId : '';
  if (!customerId || claims.sub !== customerId || payload.tenantId !== claims.tenantId) return null;
  return { tenantId: claims.tenantId, customerId, scope: 'lpdp_titular' };
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = new TextDecoder().decode(b64urlToBytes(part));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** POST /api/lpdp/titular/verify — público: identidad del titular por datos. */
// eslint-disable-next-line complexity -- mantiene fail-closed visibles en cada frontera sensible.
export async function runTitularVerifyHttp(
  env: WorkerEnv | undefined,
  body: Record<string, unknown>,
  sourceIp = 'unknown',
): Promise<HttpResult> {
  if (lpdpKilled(env)) return featureOff();
  if (!env?.DB || !env.AUTH_JWT_HS_SECRET) return dbUnavailable();
  const challengeId = crypto.randomUUID();
  if (
    !env.EMAIL ||
    !env.LPDP_OTP_FROM?.trim() ||
    !env.LPDP_OTP_HMAC_SECRET ||
    !env.LPDP_OTP_STATE_DO
  ) {
    return verificationUnavailable();
  }
  const identity = parseIdentity(body);
  if (!identity) {
    return {
      status: 400,
      body: { error: 'tenantId, documentNumber, name and phone required', code: 'BAD_REQUEST' },
    };
  }
  const { tenantId, documentNumber, name, phone } = identity;
  let networkResult: Awaited<ReturnType<ReturnType<typeof securityShard>['consumeRateLimit']>>;
  let subjectResult: Awaited<ReturnType<ReturnType<typeof securityShard>['consumeRateLimit']>>;
  try {
    const networkHash = await securityDigest(env, 'network', sourceIp || 'unknown');
    const normalizedDocument = documentNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const subjectKey = `${tenantId}:${normalizedDocument}`;
    const subjectHash = await securityDigest(env, 'subject', subjectKey);
    const networkShard = securityShard(env, networkHash);
    const subjectShard = securityShard(env, subjectHash);
    [networkResult, subjectResult] = await Promise.all([
      networkShard.consumeRateLimit({
        keyHash: networkHash,
        limit: NETWORK_VERIFY_LIMIT,
        windowMs: VERIFY_WINDOW_MS,
        nowMs: Date.now(),
      }),
      subjectShard.consumeRateLimit({
        keyHash: subjectHash,
        limit: SUBJECT_VERIFY_LIMIT,
        windowMs: VERIFY_WINDOW_MS,
        nowMs: Date.now(),
      }),
    ]);
  } catch {
    return verificationUnavailable();
  }
  if (!networkResult.allowed || !subjectResult.allowed) {
    return { status: 429, body: { error: 'Too many attempts', code: 'RATE_LIMITED' } };
  }
  const capabilityError = await requireLpdp(env, tenantId);
  if (capabilityError) return capabilityError;

  let row: { id: string; name: string | null; phone: string | null; email: string | null } | null;
  try {
    row = await env.DB.prepare(
      `SELECT id, name, phone, email FROM customers
       WHERE tenant_id = ? AND document_number = ? AND pii_erased = 0
       LIMIT 1`,
    )
      .bind(tenantId, documentNumber)
      .first<{ id: string; name: string | null; phone: string | null; email: string | null }>();
  } catch {
    return verificationUnavailable();
  }
  if (!row) {
    return genericOtpChallenge(challengeId);
  }
  if (normalize(row.name) !== normalize(name) || normalize(row.phone) !== normalize(phone)) {
    return genericOtpChallenge(challengeId);
  }

  if (!row.email?.trim()) return genericOtpChallenge(challengeId);
  const code = randomOtp();
  const expiresAtMs = Date.now() + OTP_TTL_MS;
  try {
    const challengeDigest = await securityDigest(env, 'challenge', challengeId);
    const state = securityShard(env, challengeDigest);
    await state.createOtpChallenge({
      challengeId,
      tenantId,
      customerId: row.id,
      codeHash: await securityDigest(env, 'otp', `${challengeId}:${code}`),
      expiresAtMs,
    });
    await env.EMAIL.send({
      to: row.email,
      from: { email: env.LPDP_OTP_FROM.trim(), name: 'KipusPay · Privacidad' },
      subject: 'Tu código para verificar tu solicitud de datos',
      text: `Tu código de verificación es ${code}. Vence en 5 minutos. Si no solicitaste este código, puedes ignorar este correo.`,
      html: `<p>Tu código de verificación es <strong>${code}</strong>.</p><p>Vence en 5 minutos. Si no solicitaste este código, puedes ignorar este correo.</p>`,
    });
  } catch {
    // El reto no fue revelado al cliente; queda inaccesible y expira por alarma.
    return verificationUnavailable();
  }
  return genericOtpChallenge(challengeId);
}

/** POST /api/lpdp/titular/verify-otp — consume un OTP y emite el token titular. */
// eslint-disable-next-line complexity -- consume OTP, revalida titular/capability y solo entonces firma.
export async function runTitularVerifyOtpHttp(
  env: WorkerEnv | undefined,
  body: Record<string, unknown>,
  sourceIp = 'unknown',
): Promise<HttpResult> {
  if (lpdpKilled(env)) return featureOff();
  if (!env?.DB || !env.AUTH_JWT_HS_SECRET) return dbUnavailable();
  if (!env.LPDP_OTP_STATE_DO || !env.LPDP_OTP_HMAC_SECRET) return verificationUnavailable();
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !OTP_FORMAT.test(code)) {
    return { status: 403, body: { error: 'TITULAR_VERIFY_FAILED', code: 'TITULAR_VERIFY_FAILED' } };
  }
  try {
    const networkHash = await securityDigest(env, 'network', sourceIp || 'unknown');
    const networkResult = await securityShard(env, networkHash).consumeRateLimit({
      keyHash: networkHash,
      limit: NETWORK_VERIFY_LIMIT,
      windowMs: VERIFY_WINDOW_MS,
      nowMs: Date.now(),
    });
    if (!networkResult.allowed) {
      return { status: 429, body: { error: 'Too many attempts', code: 'RATE_LIMITED' } };
    }
    const challengeDigest = await securityDigest(env, 'challenge', challengeId);
    const state = securityShard(env, challengeDigest);
    const consumed = await state.consumeOtpChallenge({
      challengeId,
      codeHash: await securityDigest(env, 'otp', `${challengeId}:${code}`),
      nowMs: Date.now(),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });
    if (consumed.kind !== 'VERIFIED') {
      return {
        status: 403,
        body: { error: 'TITULAR_VERIFY_FAILED', code: 'TITULAR_VERIFY_FAILED' },
      };
    }
    const capabilityError = await requireLpdp(env, consumed.tenantId);
    if (capabilityError) return capabilityError;
    const activeCustomer = await env.DB.prepare(
      `SELECT id FROM customers WHERE tenant_id = ? AND id = ? AND pii_erased = 0 LIMIT 1`,
    )
      .bind(consumed.tenantId, consumed.customerId)
      .first<{ id: string }>();
    if (!activeCustomer) {
      return {
        status: 403,
        body: { error: 'TITULAR_VERIFY_FAILED', code: 'TITULAR_VERIFY_FAILED' },
      };
    }
    const now = Date.now();
    const token = await signHs256(env.AUTH_JWT_HS_SECRET, {
      tenantId: consumed.tenantId,
      sub: consumed.customerId,
      customerId: consumed.customerId,
      scope: 'lpdp_titular',
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + TITULAR_TTL_MS) / 1000),
    });
    return { status: 200, body: { token, expiresInSeconds: TITULAR_TTL_MS / 1000 } };
  } catch {
    return verificationUnavailable();
  }
}

/** GET /api/lpdp/titular/export — copia de datos del titular (LPDP-02). */
export async function runTitularExportHttp(
  env: WorkerEnv | undefined,
  authz: string,
): Promise<HttpResult> {
  if (lpdpKilled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
  const capabilityError = await requireLpdp(env, titular.tenantId);
  if (capabilityError) return capabilityError;
  try {
    return {
      status: 200,
      body: { export: await exportCustomer(env.DB, titular.tenantId, titular.customerId) },
    };
  } catch (e) {
    return mapErr(e);
  }
}

/** GET /api/lpdp/titular/consents — consentimientos del titular (LPDP-01). */
export async function runTitularConsentsHttp(
  env: WorkerEnv | undefined,
  authz: string,
): Promise<HttpResult> {
  if (lpdpKilled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
  const capabilityError = await requireLpdp(env, titular.tenantId);
  if (capabilityError) return capabilityError;
  try {
    const consents = await listConsents(env.DB, titular.tenantId, titular.customerId);
    return { status: 200, body: { customerId: titular.customerId, consents } };
  } catch (e) {
    return mapErr(e);
  }
}

/** POST /api/lpdp/titular/consent — grant/revoke del titular (LPDP-01). */
export async function runTitularConsentHttp(
  env: WorkerEnv | undefined,
  authz: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (lpdpKilled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
  const capabilityError = await requireLpdp(env, titular.tenantId);
  if (capabilityError) return capabilityError;
  // El token tiene TTL corto, pero no sobrevive al borrado del titular. La
  // comprobación se hace contra D1 antes de cualquier mutación.
  const activeCustomer = await env.DB.prepare(
    `SELECT id FROM customers WHERE tenant_id = ? AND id = ? AND pii_erased = 0 LIMIT 1`,
  )
    .bind(titular.tenantId, titular.customerId)
    .first<{ id: string }>();
  if (!activeCustomer) {
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
  }
  const purpose = typeof body.purpose === 'string' ? body.purpose : '';
  const granted = body.granted === true;
  if (!purpose) return { status: 400, body: { error: 'purpose required', code: 'BAD_REQUEST' } };
  try {
    await writeConsent(
      env.DB,
      titular.tenantId,
      titular.customerId,
      purpose,
      granted,
      new Date().toISOString(),
    );
    return { status: 200, body: { customerId: titular.customerId, purpose, granted } };
  } catch (e) {
    return mapErr(e);
  }
}

/** POST /api/lpdp/titular/erase — anonimización con doble confirmación (LPDP-03). */
export async function runTitularEraseHttp(
  env: WorkerEnv | undefined,
  authz: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (lpdpKilled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
  const capabilityError = await requireLpdp(env, titular.tenantId);
  if (capabilityError) return capabilityError;
  if (body.confirmed !== true) {
    return {
      status: 400,
      body: {
        error: 'TITULAR_ERASE_CONFIRMATION_REQUIRED',
        code: 'TITULAR_ERASE_CONFIRMATION_REQUIRED',
      },
    };
  }
  try {
    const result = await eraseCustomer(env.DB, {
      tenantId: titular.tenantId,
      branchId: null,
      actorUserId: titular.customerId,
      customerId: titular.customerId,
      nowIso: new Date().toISOString(),
    });
    return { status: 200, body: { ...result } };
  } catch (e) {
    return mapErr(e);
  }
}
