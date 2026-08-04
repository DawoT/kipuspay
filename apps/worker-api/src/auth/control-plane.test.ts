import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRevocationLookup,
  clearIsolateAuthCache,
  createAuthDepsFromEnv,
  getTenantCached,
  isTenantRevokedCached,
  type ControlPlaneEnv,
} from './control-plane.js';
import { createTenantAndAuthMiddleware } from './tenant-auth-middleware.js';

afterEach(() => {
  clearIsolateAuthCache();
});

function fakeEnv(opts: {
  tenantJson?: string | null;
  kvRevocation?: string | null;
  doRevoked?: boolean;
  doDown?: boolean;
  kvGetThrows?: boolean;
}): ControlPlaneEnv {
  return {
    TENANT_KV: {
      get: (key: string) => {
        if (opts.kvGetThrows) return Promise.reject(new Error('KV_DOWN'));
        if (key.startsWith('tenant:')) {
          return Promise.resolve(opts.tenantJson === undefined ? null : opts.tenantJson);
        }
        if (key.startsWith('revocation:')) {
          return Promise.resolve(opts.kvRevocation ?? null);
        }
        return Promise.resolve(null);
      },
    },
    TENANT_STATE_DO: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        fetch: () => {
          if (opts.doDown) return Promise.reject(new Error('DO_DOWN'));
          return Promise.resolve(Response.json({ revoked: opts.doRevoked === true }));
        },
      }),
    },
  };
}

const activeTenantJson = JSON.stringify({
  id: 't1',
  status: 'active',
  subscriptionStatus: 'past_due',
  pastGracePeriod: true,
});

describe('control-plane PERF-04 + fail-closed', () => {
  it('getTenantCached lee KV y mapea snapshot', async () => {
    const env = fakeEnv({ tenantJson: activeTenantJson });
    const tenant = await getTenantCached(env, 't1');
    expect(tenant).toMatchObject({
      id: 't1',
      status: 'active',
      subscriptionStatus: 'past_due',
      pastGracePeriod: true,
    });
  });

  it('KV revocation=1 autoriza revoked sin llamar DO', async () => {
    let doCalls = 0;
    const env = fakeEnv({ kvRevocation: '1' });
    env.TENANT_STATE_DO.get = () => ({
      fetch: () => {
        doCalls += 1;
        return Promise.resolve(Response.json({ revoked: false }));
      },
    });
    await expect(isTenantRevokedCached(env, 't1')).resolves.toBe(true);
    expect(doCalls).toBe(0);
  });

  it('DO revoked=true → lookup available revoked', async () => {
    const env = fakeEnv({ doRevoked: true });
    await expect(checkRevocationLookup(env, 't1')).resolves.toEqual({
      available: true,
      revoked: true,
    });
  });

  it('DO caído → available:false (nunca revoked=false por omisión)', async () => {
    const env = fakeEnv({ doDown: true });
    await expect(isTenantRevokedCached(env, 't1')).rejects.toThrow('REVOCATION_CHECK_UNAVAILABLE');
    await expect(checkRevocationLookup(env, 't1')).resolves.toEqual({ available: false });
  });

  it('KV down no inventa permiso: continúa al DO', async () => {
    const env = fakeEnv({ kvGetThrows: true, doRevoked: false });
    await expect(isTenantRevokedCached(env, 't1')).resolves.toBe(false);
  });
});

describe('HTTP: control plane cableado al middleware', () => {
  function appWithEnv(env: ControlPlaneEnv): Hono {
    const base = createAuthDepsFromEnv(env);
    // Slice 2: JWT real es slice 3 — inyectamos verify para ejercitar KV/DO.
    const deps = {
      ...base,
      verifyJwt: () => Promise.resolve({ tenantId: 't1', sub: 'u1' }),
    };
    const app = new Hono();
    app.use('/api/*', createTenantAndAuthMiddleware(deps));
    app.post('/api/pos/checkout', (c) => c.json({ ok: true }));
    app.get('/api/owner/dashboard', (c) => c.json({ ok: true }));
    return app;
  }

  it('DO revoked → 403 TENANT_REVOKED', async () => {
    const app = appWithEnv(fakeEnv({ tenantJson: activeTenantJson, doRevoked: true }));
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'TENANT_REVOKED' });
  });

  it('DO down → 503 REVOCATION_CHECK_UNAVAILABLE', async () => {
    const app = appWithEnv(fakeEnv({ tenantJson: activeTenantJson, doDown: true }));
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      code: 'REVOCATION_CHECK_UNAVAILABLE',
    });
  });

  it('past_due + DO ok: cobro 200 y premium 402 (Plan Guard)', async () => {
    const app = appWithEnv(fakeEnv({ tenantJson: activeTenantJson, doRevoked: false }));
    const sale = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
    });
    expect(sale.status).toBe(200);

    const premium = await app.request('/api/owner/dashboard', {
      headers: { authorization: 'Bearer tok' },
    });
    expect(premium.status).toBe(402);
  });
});
