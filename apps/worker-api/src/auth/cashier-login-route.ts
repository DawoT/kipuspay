/** Sprint C2 — login local del POS con PIN de cajero (ADR-0034). */
import {
  clearPinLockout,
  hashPinArgon2id,
  readPinLockout,
  recordPinFailure,
  verifyPinHash,
} from '@kipuspay/adapters-d1';
import { signHs256 } from './verify-jwt.js';
import type { WorkerEnv } from './control-plane.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export const CASHIER_SESSION_TTL_SECONDS = 12 * 60 * 60;
const CASHIER_ROLES = new Set(['cashier', 'supervisor']);

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'Auth capability off', code: 'FEATURE_OFF' } };
}

interface LoginRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  role: string;
  pin_hash: string | null;
}

async function resolveLoginUser(
  db: D1Database,
  tenantId: string,
  identifier: string,
): Promise<LoginRow | null> {
  return db
    .prepare(
      `SELECT id, tenant_id, branch_id, role, pin_hash FROM users
       WHERE tenant_id = ? AND (id = ? OR badge_barcode = ?)
         AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(tenantId, identifier, identifier)
    .first<LoginRow>();
}

function credentialError(body: {
  tenantId?: unknown;
  identifier?: unknown;
  pin?: unknown;
}): HttpResult | null {
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!tenantId || !identifier || !pin || pin.length > 128) {
    return { status: 401, body: { error: 'Credentials required', code: 'UNAUTHORIZED' } };
  }
  return null;
}

async function sessionResult(env: WorkerEnv, user: LoginRow, nowMs: number): Promise<HttpResult> {
  const secret = env.AUTH_JWT_HS_SECRET;
  if (!secret) {
    return { status: 503, body: { error: 'Signing unavailable', code: 'SIGNING_UNAVAILABLE' } };
  }
  const nowSec = Math.floor(nowMs / 1000);
  const token = await signHs256(secret, {
    sub: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    branchId: user.branch_id ?? '',
    auth_time: nowSec,
    iat: nowSec,
    nbf: nowSec,
    exp: nowSec + CASHIER_SESSION_TTL_SECONDS,
  });
  return {
    status: 200,
    body: {
      token,
      expiresAt: new Date(nowMs + CASHIER_SESSION_TTL_SECONDS * 1000).toISOString(),
      user: { userId: user.id, role: user.role, branchId: user.branch_id ?? '' },
    },
  };
}

async function verifyPinWithLockout(
  db: D1Database,
  tenantId: string,
  userId: string,
  pin: string,
  storedPinHash: string,
  nowMs: number,
): Promise<'ok' | 'locked' | 'invalid' | 'unavailable'> {
  let verified: Awaited<ReturnType<typeof verifyPinHash>>;
  try {
    verified = await verifyPinHash(pin, storedPinHash);
  } catch {
    return 'unavailable';
  }
  if (!verified.ok) {
    const after = await recordPinFailure(db, tenantId, userId, nowMs);
    if (after.locked) return 'locked';
    return 'invalid';
  }
  if (verified.needsRehash) {
    let upgradedHash: string;
    try {
      upgradedHash = await hashPinArgon2id(pin);
    } catch {
      return 'unavailable';
    }
    let rehash: D1Result;
    try {
      rehash = await db
        .prepare('UPDATE users SET pin_hash = ? WHERE tenant_id = ? AND id = ? AND pin_hash = ?')
        .bind(upgradedHash, tenantId, userId, storedPinHash)
        .run();
    } catch {
      return 'unavailable';
    }
    if ((rehash.meta?.changes ?? 0) !== 1) return 'invalid';
  }
  await clearPinLockout(db, tenantId, userId);
  return 'ok';
}

// eslint-disable-next-line complexity -- authentication policy branches are explicit
export async function runCashierLoginHttp(
  env: WorkerEnv | undefined,
  body: { tenantId?: unknown; identifier?: unknown; pin?: unknown },
): Promise<HttpResult> {
  // Global flag is a deployment kill switch only; tenant capability remains
  // the authority for enabling cashier login.
  if (env?.FEATURE_AUTH_CASHIER_LOGIN === '0') return featureOff();
  const invalid = credentialError(body);
  if (invalid) return invalid;
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  try {
    await new CapabilityResolver(env).require(tenantId, 'auth.cashier_login');
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status,
        body: { error: error.code, code: error.status === 404 ? 'FEATURE_OFF' : error.code },
      };
    }
    return {
      status: 503,
      body: { error: 'Capabilities unavailable', code: 'CAPABILITIES_UNAVAILABLE' },
    };
  }

  const user = await resolveLoginUser(env.DB, tenantId, identifier);
  if (!user?.pin_hash) {
    return user
      ? { status: 403, body: { error: 'PIN not configured', code: 'PIN_NOT_CONFIGURED' } }
      : { status: 403, body: { error: 'Invalid credentials', code: 'PIN_INVALID' } };
  }
  if (!CASHIER_ROLES.has(user.role.toLowerCase())) {
    return {
      status: 403,
      body: { error: 'Role not allowed for cashier login', code: 'ROLE_NOT_ALLOWED' },
    };
  }

  const nowMs = Date.now();
  const lockout = await readPinLockout(env.DB, tenantId, user.id, nowMs);
  if (lockout.locked) {
    return { status: 403, body: { error: 'PIN locked', code: 'PIN_LOCKED' } };
  }

  const pinResult = await verifyPinWithLockout(
    env.DB,
    tenantId,
    user.id,
    pin,
    user.pin_hash,
    nowMs,
  );
  if (pinResult === 'locked') {
    return { status: 403, body: { error: 'PIN locked', code: 'PIN_LOCKED' } };
  }
  if (pinResult === 'invalid') {
    return { status: 403, body: { error: 'Invalid credentials', code: 'PIN_INVALID' } };
  }
  if (pinResult === 'unavailable') {
    return {
      status: 503,
      body: { error: 'PIN verification unavailable', code: 'PIN_VERIFICATION_UNAVAILABLE' },
    };
  }
  return sessionResult(env, user, nowMs);
}
