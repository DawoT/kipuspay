import { describe, expect, it } from 'vitest';
import {
  runCashierLoginHttp,
  CASHIER_SESSION_TTL_SECONDS,
} from './cashier-login-route.js';
import { verifyJwt, type JwtVerifyEnv } from './verify-jwt.js';

const SECRET = 'test-secret-for-cashier-login';

function mockEnv(
  pinHash: string | null,
  user?: Record<string, unknown> | null,
): { FEATURE_AUTH_CASHIER_LOGIN: string; AUTH_JWT_HS_SECRET: string; DB: unknown } {
  const row =
    user === undefined
      ? {
          id: 'u1',
          tenant_id: 't1',
          branch_id: 'b1',
          role: 'cashier',
          pin_hash: pinHash,
        }
      : user;
  const lockout = { pin_attempts: 0, pin_locked_until: null as string | null };
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: () => {
          if (sql.includes('pin_attempts') && sql.includes('pin_locked_until')) {
            return Promise.resolve({ ...lockout });
          }
          return Promise.resolve(row);
        },
        all: () => Promise.resolve({ results: [] }),
        run: () => {
          if (sql.includes('UPDATE users SET')) {
            if (sql.includes('pin_attempts = 0, pin_locked_until = NULL')) {
              lockout.pin_attempts = 0;
              lockout.pin_locked_until = null;
            } else {
              lockout.pin_attempts += 1;
              if (lockout.pin_attempts >= 5) {
                lockout.pin_locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
              }
            }
          }
          return Promise.resolve({ success: true, meta: {} });
        },
      };
      return stmt;
    },
  };
  return { FEATURE_AUTH_CASHIER_LOGIN: '1', AUTH_JWT_HS_SECRET: SECRET, DB: db };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodePayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? '';
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
}

describe('Sprint C2 cashier login route', () => {
  it('capability off → 404 FEATURE_OFF', async () => {
    const result = await runCashierLoginHttp(undefined, { tenantId: 't1', identifier: 'u1', pin: '1234' });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('FEATURE_OFF');
  });

  it('sin campos → 401', async () => {
    const env = mockEnv('x');
    const result = await runCashierLoginHttp(env as never, {});
    expect(result.status).toBe(401);
  });

  it('sin DB → 503', async () => {
    const result = await runCashierLoginHttp(
      { FEATURE_AUTH_CASHIER_LOGIN: '1' } as never,
      { tenantId: 't1', identifier: 'u1', pin: '1234' },
    );
    expect(result.status).toBe(503);
  });

  it('identifier desconocido → PIN_INVALID (sin enumeración)', async () => {
    const env = mockEnv(null, null);
    const result = await runCashierLoginHttp(env as never, {
      tenantId: 't1',
      identifier: 'nadie',
      pin: '1234',
    });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('PIN_INVALID');
  });

  it('usuario sin pin_hash → PIN_NOT_CONFIGURED', async () => {
    const env = mockEnv(null);
    const result = await runCashierLoginHttp(env as never, {
      tenantId: 't1',
      identifier: 'u1',
      pin: '1234',
    });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('PIN_NOT_CONFIGURED');
  });

  it('PIN correcto → mint JWT con claims y exp 12h', async () => {
    const pinHash = await sha256Hex('1234');
    const env = mockEnv(pinHash);
    const result = await runCashierLoginHttp(env as never, {
      tenantId: 't1',
      identifier: 'EMP-12345',
      pin: '1234',
    });
    expect(result.status).toBe(200);
    const token = result.body.token as string;
    const payload = decodePayload(token);
    expect(payload).toMatchObject({ sub: 'u1', tenantId: 't1', role: 'cashier', branchId: 'b1' });
    const nowSec = Math.floor(Date.now() / 1000);
    expect(Number(payload.exp) - Number(payload.iat)).toBe(CASHIER_SESSION_TTL_SECONDS);
    expect(Number(payload.iat)).toBeLessThanOrEqual(nowSec);
    const verified = await verifyJwt({ AUTH_JWT_HS_SECRET: SECRET } satisfies JwtVerifyEnv, token);
    expect(verified?.tenantId).toBe('t1');
    expect(verified?.sub).toBe('u1');
  });

  it('PIN incorrecto → PIN_INVALID y lockout en el 5º fallo (SEC-11)', async () => {
    const pinHash = await sha256Hex('1234');
    const env = mockEnv(pinHash);
    for (let i = 0; i < 4; i++) {
      const result = await runCashierLoginHttp(env as never, {
        tenantId: 't1',
        identifier: 'u1',
        pin: '9999',
      });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('PIN_INVALID');
    }
    const fifth = await runCashierLoginHttp(env as never, {
      tenantId: 't1',
      identifier: 'u1',
      pin: '9999',
    });
    expect(fifth.status).toBe(403);
    expect(fifth.body.code).toBe('PIN_LOCKED');
    const locked = await runCashierLoginHttp(env as never, {
      tenantId: 't1',
      identifier: 'u1',
      pin: '1234',
    });
    expect(locked.status).toBe(403);
    expect(locked.body.code).toBe('PIN_LOCKED');
  });

  it('sin secret de firma → 503 SIGNING_UNAVAILABLE', async () => {
    const pinHash = await sha256Hex('1234');
    const env = mockEnv(pinHash);
    const noSecret = { FEATURE_AUTH_CASHIER_LOGIN: '1', DB: env.DB };
    const result = await runCashierLoginHttp(noSecret as never, {
      tenantId: 't2',
      identifier: 'u2',
      pin: '1234',
    });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('SIGNING_UNAVAILABLE');
  });
});
