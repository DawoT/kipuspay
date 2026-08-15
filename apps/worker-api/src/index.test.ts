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

  it('does not expose recurring manual control through public fetch', async () => {
    const res = await createApp().request('/internal/support/recurring/run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer raw-support-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tenantId: 'tenant-a',
        planId: 'plan-a',
        idempotencyKey: 'manual-a',
      }),
    });
    expect(res.status).toBe(404);
  });

  it.each([
    ['GET', '/api/inventory/scale/devices'],
    ['POST', '/api/inventory/scale/devices'],
    ['POST', '/api/inventory/scale/diagnostics'],
    ['POST', '/api/inventory/scale/devices/disable'],
    ['PUT', '/api/inventory/scale/policy'],
    ['POST', '/api/inventory/scale/authorize-manual'],
    ['POST', '/api/inventory/scale/measurements'],
  ])('registers Sprint 40 scale route %s %s', async (method, path) => {
    const res = await authedApp.request(
      path,
      {
        method,
        headers: {
          authorization: 'Bearer tok',
          'content-type': 'application/json',
          'x-terminal-id': 'terminal-1',
        },
        ...(method === 'GET' ? {} : { body: '{}' }),
      },
      { FEATURE_INVENTORY_SCALE: '1' },
    );
    expect(res.status).not.toBe(404);
  });

  it('POST /v1/webhooks/stripe sin secret/firma → 400 (sin JWT)', async () => {
    const res = await createApp().request('/v1/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  it('C1+A4: webhook POS vive en /v1 (sin JWT) y exige x-kipus-timestamp', async () => {
    const app = createApp();
    const missing = await app.request('/v1/webhooks/payments/yape', {
      method: 'POST',
      body: '{}',
    });
    expect(missing.status).toBe(400);

    const bad = await app.request('/v1/webhooks/payments/yape', {
      method: 'POST',
      headers: { 'x-kipus-timestamp': 'not-a-number' },
      body: '{}',
    });
    expect(bad.status).toBe(400);

    const authed = await app.request('/api/webhooks/payments/yape', {
      method: 'POST',
      headers: { 'x-kipus-timestamp': String(Math.floor(Date.now() / 1000)) },
      body: '{}',
    });
    expect(authed.status).toBe(401);
  });
});

describe('CORS público de onboarding (M6B)', () => {
  it('OPTIONS del claim responde preflight con ACAO del origen permitido', async () => {
    const app = createApp();
    const res = await app.request(
      '/api/onboarding/claim',
      {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:4173', 'access-control-request-method': 'POST' },
      },
      { ALLOWED_ORIGINS: 'http://localhost:4173' },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4173');
  });

  it('OPTIONS de una ruta autenticada /api/* responde preflight sin exigir JWT', async () => {
    const app = createApp();
    const res = await app.request(
      '/api/catalog/sellable',
      {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:4173', 'access-control-request-method': 'GET' },
      },
      { ALLOWED_ORIGINS: '*' },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/GET/);
  });

  it('el POST del claim sin CORS configurado no filtra ACAO (fail-closed)', async () => {
    const res = await createApp().request('/api/onboarding/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ token: 'cualquiera' }),
    });
    expect([403, 503]).toContain(res.status);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('POST de login y GET de sesión reciben CORS (métodos + ACAO en la respuesta)', async () => {
    const app = createApp();
    const env = {
      ALLOWED_ORIGINS: 'http://localhost:4173,http://localhost:5173,http://localhost:5174',
    };
    const probes = [
      {
        id: 'login-options-4173',
        path: '/api/auth/cashier-login',
        init: {
          method: 'OPTIONS',
          headers: { origin: 'http://localhost:4173', 'access-control-request-method': 'POST' },
        },
      },
      {
        id: 'session-options-get-4173',
        path: '/api/auth/session',
        init: {
          method: 'OPTIONS',
          headers: { origin: 'http://localhost:4173', 'access-control-request-method': 'GET' },
        },
      },
      {
        id: 'session-options-get-5173',
        path: '/api/auth/session',
        init: {
          method: 'OPTIONS',
          headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
        },
      },
      {
        id: 'login-post-4173',
        path: '/api/auth/cashier-login',
        init: {
          method: 'POST',
          headers: { origin: 'http://localhost:4173', 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId: 't', identifier: 'x', pin: '0000' }),
        },
      },
    ] as const;
    const results: Record<string, { status: number; acao: string | null; methods: string | null }> =
      {};
    for (const probe of probes) {
      const res = await app.request(probe.path, probe.init, env);
      results[probe.id] = {
        status: res.status,
        acao: res.headers.get('Access-Control-Allow-Origin'),
        methods: res.headers.get('Access-Control-Allow-Methods'),
      };
    }
    expect(results['login-options-4173']?.status).toBe(204);
    expect(results['login-options-4173']?.acao).toBe('http://localhost:4173');
    expect(results['session-options-get-4173']?.methods).toMatch(/GET/);
    expect(results['session-options-get-5173']?.acao).toBe('http://localhost:5173');
    expect(results['session-options-get-5173']?.methods).toMatch(/GET/);
    expect(results['login-post-4173']?.acao).toBe('http://localhost:4173');
  });

  it('GET /v1/sales lleva ACAO en la respuesta (no solo el preflight)', async () => {
    const res = await createApp().request(
      '/v1/sales',
      { method: 'GET', headers: { origin: 'https://app.kipuspay.com' } },
      { ALLOWED_ORIGINS: 'https://kipuspay.com,https://app.kipuspay.com' },
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.kipuspay.com');
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/GET/);
  });

  it('GET /api/kds/ws sin ticket → 401 (no JWT en handshake WS)', async () => {
    const res = await createApp().request('/api/kds/ws?branchId=default', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('POST /v1/reclamaciones lleva ACAO en la respuesta', async () => {
    const res = await createApp().request(
      '/v1/reclamaciones',
      {
        method: 'POST',
        headers: {
          origin: 'https://kipuspay.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          claimantName: 'Ana',
          documentType: 'DNI',
          documentNumber: '1',
          email: 'ana@example.com',
          claimKind: 'reclamo',
          detail: 'x',
        }),
      },
      { ALLOWED_ORIGINS: 'https://kipuspay.com,https://app.kipuspay.com' },
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kipuspay.com');
  });
});

describe('catálogo vendible del POS (C1 — fe de errata)', () => {
  it('GET /api/catalog/sellable existe y exige auth (401 sin JWT)', async () => {
    const res = await createApp().request('/api/catalog/sellable', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('devuelve 404 FEATURE_OFF sin el flag (JWT válido mockeado)', async () => {
    const res = await authedApp.request('/api/catalog/sellable', {
      method: 'GET',
      headers: { authorization: 'Bearer tok', 'x-tenant-id': 't1' },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'FEATURE_OFF' });
  });
});

describe('F-1 contrato Dueño: las 6 rutas owner propagan role (auditoría browser)', () => {
  const ownerApp = createApp({
    verifyJwt: () => Promise.resolve({ tenantId: 't1', sub: 'u1' }),
    getTenant: () => Promise.resolve(active),
    checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
    loadUser: () =>
      Promise.resolve({
        ok: true,
        user: {
          userId: 'u1',
          tenantId: 't1',
          branchId: 'b1',
          allowedBranches: ['b1'],
          role: 'owner',
          permissions: [],
        },
      }),
  });

  const ownerRoutes: readonly [string, string][] = [
    ['GET', '/api/owner/quotes/expired'],
    ['GET', '/api/owner/purchasing/three-way'],
    ['GET', '/api/owner/purchasing/returns'],
    ['GET', '/api/owner/ledger/store-credit'],
    ['GET', '/api/owner/installments/overdue'],
    ['GET', '/api/owner/commissions'],
  ];

  const ownerEnv = {
    FEATURE_SALES_QUOTES: '1',
    FEATURE_PURCHASING_THREE_WAY: '1',
    FEATURE_PURCHASING_RETURNS: '1',
    FEATURE_LEDGER_STORE_CREDIT: '1',
    FEATURE_SALES_INSTALLMENTS: '1',
    FEATURE_SALES_COMMISSIONS: '1',
    DB: {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ success: true }),
        }),
        all: () => Promise.resolve({ results: [] }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ success: true }),
      }),
      batch: () => Promise.resolve([]),
    },
  };

  it.each(ownerRoutes)('%s %s no responde FORBIDDEN_ROLE con role=owner', async (method, path) => {
    const res = await ownerApp.request(
      path,
      {
        method,
        headers: { authorization: 'Bearer tok', 'x-tenant-id': 't1' },
      },
      ownerEnv,
    );
    expect(res.status, `${method} ${path}`).not.toBe(403);
    const body: { code?: string } = await res.json();
    expect(body.code, `${method} ${path}`).not.toBe('FORBIDDEN_ROLE');
  });
});
