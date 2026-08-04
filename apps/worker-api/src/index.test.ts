import { describe, expect, it } from 'vitest';
import type { AuthTenantSnapshot } from './auth/auth-decide.js';
import { createApp } from './index.js';

const active: AuthTenantSnapshot = {
  id: 't1',
  status: 'active',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  pastGracePeriod: false,
};

const authedApp = createApp({
  verifyJwt: () => Promise.resolve({ tenantId: 't1', sub: 'u1' }),
  getTenant: () => Promise.resolve(active),
  checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
});

describe('worker-api', () => {
  it('expone /health sin auth', async () => {
    const res = await createApp().request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });

  it('calcula totales desde domain-sales con auth OK', async () => {
    const res = await authedApp.request('/api/pos/totals', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer tok',
      },
      body: JSON.stringify({ lines: [{ productId: 'a', priceCents: 5000, qty: 2 }] }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      subtotalCents: 10000,
      igvCents: 1800,
      totalCents: 11800,
    });
  });

  it('trata un body sin lines como cesta vacía', async () => {
    const res = await authedApp.request('/api/pos/totals', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer tok',
      },
      body: JSON.stringify({}),
    });
    await expect(res.json()).resolves.toEqual({ subtotalCents: 0, igvCents: 0, totalCents: 0 });
  });

  it('fail-closed: /api/pos/totals → 401 con deps default (JWT no verificable)', async () => {
    const res = await createApp().request('/api/pos/totals', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer tok',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});
