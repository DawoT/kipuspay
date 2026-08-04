import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthTenantSnapshot } from './auth-decide.js';
import { loadUserFromD1, type UserLookupDb, type UserRow } from './idp-user.js';
import { createTenantAndAuthMiddleware, type TenantAuthDeps } from './tenant-auth-middleware.js';
import { signHs256ForTests, verifyJwt } from './verify-jwt.js';

const SECRET = 'unit-test-hs-secret';
const nowMs = Date.parse('2026-08-04T12:00:00Z');

const tenant: AuthTenantSnapshot = {
  id: 't1',
  status: 'active',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  pastGracePeriod: false,
};

function fakeUserDb(row: UserRow | null): UserLookupDb {
  return {
    prepare: () => ({
      bind: () => ({
        first: <T>() => Promise.resolve(row as T | null),
      }),
    }),
  };
}

function appWith(deps: TenantAuthDeps): Hono {
  const app = new Hono();
  app.use('/api/*', createTenantAndAuthMiddleware(deps));
  app.post('/api/pos/checkout', (c) => c.json({ ok: true }));
  return app;
}

describe('HTTP JWT + IdP', () => {
  it('401 con JWT inválido', async () => {
    const app = appWith({
      verifyJwt: (token) => verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, token, nowMs),
      getTenant: () => Promise.resolve(tenant),
      checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
      nowMs: () => nowMs,
    });
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(res.status).toBe(401);
  });

  it('403 hint mismatch con JWT válido', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'ext-1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    const app = appWith({
      verifyJwt: (t) => verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, t, nowMs),
      getTenant: () => Promise.resolve(tenant),
      checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
      nowMs: () => nowMs,
    });
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'other-tenant',
      },
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'TENANT_HINT_MISMATCH' });
  });

  it('403 FORBIDDEN_USER si IdP no tiene usuario local', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'ext-missing',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    const app = appWith({
      verifyJwt: (t) => verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, t, nowMs),
      getTenant: () => Promise.resolve(tenant),
      checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
      loadUser: (tenantId, sub) => loadUserFromD1(fakeUserDb(null), tenantId, sub),
      nowMs: () => nowMs,
    });
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'FORBIDDEN_USER' });
  });

  it('200 cobro con JWT + usuario owner (nunca 402)', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'ext-1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    const pastDue: AuthTenantSnapshot = {
      ...tenant,
      subscriptionStatus: 'past_due',
      pastGracePeriod: true,
    };
    const app = appWith({
      verifyJwt: (t) => verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, t, nowMs),
      getTenant: () => Promise.resolve(pastDue),
      checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
      loadUser: (tenantId, sub) =>
        loadUserFromD1(
          fakeUserDb({
            id: 'u1',
            role: 'owner',
            permissions: '[]',
            branch_id: null,
          }),
          tenantId,
          sub,
        ),
      nowMs: () => nowMs,
    });
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});
