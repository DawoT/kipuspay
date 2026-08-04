import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthTenantSnapshot } from './auth-decide.js';
import { createTenantAndAuthMiddleware, type TenantAuthDeps } from './tenant-auth-middleware.js';

function appWith(deps: TenantAuthDeps): Hono {
  const app = new Hono();
  app.use('/api/*', createTenantAndAuthMiddleware(deps));
  app.post('/api/pos/checkout', (c) => c.json({ ok: true }));
  app.get('/api/owner/dashboard', (c) => c.json({ ok: true }));
  return app;
}

const tenant: AuthTenantSnapshot = {
  id: 't1',
  status: 'active',
  subscriptionStatus: 'past_due',
  trialEndsAt: null,
  pastGracePeriod: true,
};

const okDeps = (over: Partial<TenantAuthDeps> = {}): TenantAuthDeps => ({
  verifyJwt: () => Promise.resolve({ tenantId: 't1', sub: 'u1' }),
  getTenant: () => Promise.resolve(tenant),
  checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
  ...over,
});

describe('tenantAndAuthMiddleware (HTTP negativo)', () => {
  it('responde 503 fail-closed cuando revocación no es verificable', async () => {
    const app = appWith(okDeps({ checkRevocation: () => Promise.resolve({ available: false }) }));
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: 'REVOCATION_CHECK_UNAVAILABLE' });
  });

  it('permite cobro con past_due (nunca 402) si revocación OK', async () => {
    const app = appWith(okDeps());
    const res = await app.request('/api/pos/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('bloquea premium con 402 y no confunde con cobro', async () => {
    const app = appWith(okDeps());
    const premium = await app.request('/api/owner/dashboard', {
      headers: { authorization: 'Bearer tok' },
    });
    expect(premium.status).toBe(402);
  });

  it('401 sin Authorization Bearer', async () => {
    const app = appWith(okDeps());
    const res = await app.request('/api/pos/checkout', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
