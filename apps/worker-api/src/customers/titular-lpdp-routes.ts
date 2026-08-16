/**
 * Sprint C3 — LPDP ARCO self-serve del titular (regla 32a / GTM-09).
 * El titular ejercita sus derechos (LPDP-01/02/03) verificando identidad con
 * datos (tienda + DNI + nombre + teléfono) y recibe un token de titular de
 * corta duración (scope `lpdp_titular`). El token jamás habilita el panel
 * admin (requireAdmin) ni la PII de otro titular (LPDP-04: tenant/customer
 * siempre del claim verificado, nunca del payload).
 */
import { eraseCustomer, exportCustomer, listConsents, writeConsent } from '@kipuspay/adapters-d1';
import { verifyJwt, signHs256 } from '../auth/verify-jwt.js';
import { isLpdpEnabled } from '../auth/features.js';
import type { WorkerEnv } from '../auth/control-plane.js';
import type { HttpResult } from '../auth/plan-cadena.js';

export interface TitularTokenClaims {
  readonly tenantId: string;
  readonly customerId: string;
  readonly scope: 'lpdp_titular';
}

const TITULAR_TTL_MS = 15 * 60 * 1000;

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_LPDP off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function mapErr(e: unknown): HttpResult {
  const msg = e instanceof Error ? e.message : String(e);
  const safe = new Set([
    'CUSTOMER_NOT_FOUND',
    'CUSTOMER_ERASED',
    'ALREADY_ERASED',
    'UNKNOWN_CONSENT_PURPOSE',
  ]);
  if (!safe.has(msg)) return { status: 422, body: { error: msg, code: msg } };
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
  if (!customerId || payload.tenantId !== claims.tenantId) return null;
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
export async function runTitularVerifyHttp(
  env: WorkerEnv | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isLpdpEnabled(env)) return featureOff();
  if (!env?.DB || !env.AUTH_JWT_HS_SECRET) return dbUnavailable();
  const identity = parseIdentity(body);
  if (!identity) {
    return {
      status: 400,
      body: { error: 'tenantId, documentNumber, name and phone required', code: 'BAD_REQUEST' },
    };
  }
  const { tenantId, documentNumber, name, phone } = identity;
  const row = await env.DB.prepare(
    `SELECT id, name, phone, pii_erased FROM customers
     WHERE tenant_id = ? AND document_number = ? AND pii_erased = 0
     LIMIT 1`,
  )
    .bind(tenantId, documentNumber)
    .first<{ id: string; name: string | null; phone: string | null; pii_erased: number }>();
  if (!row) {
    return { status: 404, body: { error: 'TITULAR_NOT_FOUND', code: 'TITULAR_NOT_FOUND' } };
  }
  if (normalize(row.name) !== normalize(name) || normalize(row.phone) !== normalize(phone)) {
    return {
      status: 403,
      body: { error: 'TITULAR_IDENTITY_MISMATCH', code: 'TITULAR_IDENTITY_MISMATCH' },
    };
  }
  const now = Date.now();
  const token = await signHs256(env.AUTH_JWT_HS_SECRET, {
    tenantId,
    sub: row.id,
    customerId: row.id,
    scope: 'lpdp_titular',
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TITULAR_TTL_MS) / 1000),
  });
  return { status: 200, body: { token, expiresInSeconds: Math.floor(TITULAR_TTL_MS / 1000) } };
}

/** GET /api/lpdp/titular/export — copia de datos del titular (LPDP-02). */
export async function runTitularExportHttp(
  env: WorkerEnv | undefined,
  authz: string,
): Promise<HttpResult> {
  if (!isLpdpEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
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
  if (!isLpdpEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
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
  if (!isLpdpEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
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
  if (!isLpdpEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const titular = await resolveTitular(env, authz);
  if (!titular)
    return { status: 401, body: { error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' } };
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
