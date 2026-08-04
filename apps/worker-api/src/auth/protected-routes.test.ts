import { describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import type { AuthTenantSnapshot } from './auth-decide.js';
import type { TenantAuthDeps } from './tenant-auth-middleware.js';

/**
 * Matriz de autorización negativa: 100% de rutas /api/* del worker-api actual.
 * /health queda fuera del middleware (intencional).
 */
const PROTECTED_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/pos/totals' },
  { method: 'POST', path: '/api/pos/offline-sale' },
  { method: 'GET', path: '/api/ledger/ar' },
  { method: 'POST', path: '/api/ledger/ar/pay' },
  { method: 'GET', path: '/api/ledger/ap' },
  { method: 'POST', path: '/api/ledger/ap' },
  { method: 'POST', path: '/api/ledger/ap/pay' },
  { method: 'POST', path: '/api/purchasing/orders' },
  { method: 'POST', path: '/api/purchasing/orders/transition' },
  { method: 'POST', path: '/api/cash/expenses' },
  { method: 'GET', path: '/api/owner/day-summary' },
  { method: 'POST', path: '/api/owner/push/subscribe' },
  { method: 'POST', path: '/api/owner/push/send' },
];

const tenant: AuthTenantSnapshot = {
  id: 't1',
  status: 'active',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  pastGracePeriod: false,
};

const authed: TenantAuthDeps = {
  verifyJwt: () => Promise.resolve({ tenantId: 't1', sub: 'u1' }),
  getTenant: () => Promise.resolve(tenant),
  checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
};

function requestInit(
  method: string,
  headers: Record<string, string>,
  withBody: boolean,
): RequestInit {
  if (withBody) {
    return { method, headers, body: '{}' };
  }
  return { method, headers };
}

describe('matriz rutas protegidas worker-api', () => {
  it('catálogo de rutas /api/* cubiertas por esta suite', () => {
    expect(PROTECTED_ROUTES.length).toBeGreaterThan(0);
  });

  it.each(PROTECTED_ROUTES)('$method $path → 401 sin Bearer', async ({ method, path }) => {
    const app = createApp(authed);
    const res = await app.request(
      path,
      requestInit(method, { 'content-type': 'application/json' }, method === 'POST'),
    );
    expect(res.status).toBe(401);
  });

  it.each(PROTECTED_ROUTES)(
    '$method $path → 503 si revocación no verificable',
    async ({ method, path }) => {
      const app = createApp({
        ...authed,
        checkRevocation: () => Promise.resolve({ available: false }),
      });
      const res = await app.request(
        path,
        requestInit(
          method,
          {
            'content-type': 'application/json',
            authorization: 'Bearer tok',
          },
          method === 'POST',
        ),
      );
      expect(res.status).toBe(503);
    },
  );

  it('/health no exige auth', async () => {
    const res = await createApp().request('/health');
    expect(res.status).toBe(200);
  });
});
