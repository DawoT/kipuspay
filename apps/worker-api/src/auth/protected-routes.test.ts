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
  { method: 'POST', path: '/api/sales/layaways' },
  { method: 'POST', path: '/api/sales/layaways/deposit' },
  { method: 'POST', path: '/api/sales/layaways/convert' },
  { method: 'POST', path: '/api/sales/layaways/cancel' },
  { method: 'GET', path: '/api/owner/layaways/overdue' },
  { method: 'POST', path: '/api/sales/quotes' },
  { method: 'POST', path: '/api/sales/quotes/send' },
  { method: 'POST', path: '/api/sales/quotes/approve' },
  { method: 'POST', path: '/api/sales/quotes/convert' },
  { method: 'POST', path: '/api/sales/quotes/cancel' },
  { method: 'GET', path: '/api/owner/quotes/expired' },
  { method: 'GET', path: '/api/ledger/journal' },
  { method: 'POST', path: '/api/ledger/journal' },
  { method: 'PATCH', path: '/api/ledger/journal' },
  { method: 'GET', path: '/api/ledger/ar' },
  { method: 'POST', path: '/api/ledger/ar/pay' },
  { method: 'GET', path: '/api/ledger/ap' },
  { method: 'POST', path: '/api/ledger/ap' },
  { method: 'POST', path: '/api/ledger/ap/pay' },
  { method: 'POST', path: '/api/purchasing/orders' },
  { method: 'POST', path: '/api/purchasing/orders/transition' },
  { method: 'POST', path: '/api/purchasing/orders/partial-receive' },
  { method: 'POST', path: '/api/purchasing/returns' },
  { method: 'POST', path: '/api/purchasing/returns/close' },
  { method: 'POST', path: '/api/purchasing/returns/cancel' },
  { method: 'GET', path: '/api/owner/purchasing/returns' },
  { method: 'POST', path: '/api/ledger/store-credit/issue' },
  { method: 'POST', path: '/api/ledger/store-credit/expire' },
  { method: 'POST', path: '/api/ledger/store-credit/adjust' },
  { method: 'GET', path: '/api/owner/ledger/store-credit' },
  { method: 'POST', path: '/api/sales/installments' },
  { method: 'POST', path: '/api/sales/installments/pay' },
  { method: 'GET', path: '/api/owner/installments/overdue' },
  { method: 'GET', path: '/api/admin/commissions/rates' },
  { method: 'POST', path: '/api/admin/commissions/rates' },
  { method: 'POST', path: '/api/admin/commissions/payouts' },
  { method: 'POST', path: '/api/admin/commissions/payouts/pay' },
  { method: 'POST', path: '/api/admin/commissions/payouts/void' },
  { method: 'GET', path: '/api/owner/commissions' },
  { method: 'POST', path: '/api/payments/charge' },
  { method: 'GET', path: '/api/payments/captures/cap1' },
  { method: 'GET', path: '/api/owner/payments/uncaptured' },
  { method: 'POST', path: '/api/inventory/transfers' },
  { method: 'POST', path: '/api/inventory/transfers/ship' },
  { method: 'POST', path: '/api/inventory/transfers/receive' },
  { method: 'POST', path: '/api/inventory/transfers/cancel' },
  { method: 'GET', path: '/api/inventory/locations?branchId=b1' },
  { method: 'POST', path: '/api/inventory/locations' },
  { method: 'PATCH', path: '/api/inventory/locations' },
  { method: 'DELETE', path: '/api/inventory/locations' },
  { method: 'GET', path: '/api/inventory/locations/stock?' + 'branchId=b1' },
  { method: 'POST', path: '/api/inventory/locations/transfer' },
  {
    method: 'GET',
    path:
      '/api/inventory/locations/picking?' + 'branchId=b1&' + 'productId=p1&quantityMicrounits=1',
  },
  { method: 'GET', path: '/api/owner/transfers/pending' },
  { method: 'POST', path: '/api/cash/expenses' },
  { method: 'POST', path: '/api/orders' },
  { method: 'POST', path: '/api/orders/fire' },
  { method: 'POST', path: '/api/orders/items/ready' },
  { method: 'POST', path: '/api/orders/items/cancel' },
  { method: 'POST', path: '/api/orders/split' },
  { method: 'GET', path: '/api/kds/ws' },
  { method: 'GET', path: '/api/owner/day-summary' },
  { method: 'POST', path: '/api/owner/push/subscribe' },
  { method: 'POST', path: '/api/owner/push/send' },
  { method: 'GET', path: '/api/reports/catalog' },
  { method: 'GET', path: '/api/reports/day-summary' },
  { method: 'GET', path: '/api/reports/advanced/top-products' },
  { method: 'POST', path: '/api/integrations/catalog-import' },
  { method: 'POST', path: '/api/integrations/accounting/export' },
  { method: 'GET', path: '/api/integrations/api-keys' },
  { method: 'POST', path: '/api/integrations/api-keys' },
  { method: 'DELETE', path: '/api/integrations/api-keys/k1' },
  { method: 'GET', path: '/api/integrations/webhooks' },
  { method: 'POST', path: '/api/integrations/webhooks' },
  { method: 'DELETE', path: '/api/integrations/webhooks/ep1' },
  { method: 'POST', path: '/api/integrations/webhooks/drain' },
  { method: 'POST', path: '/api/loyalty/reserve' },
  { method: 'GET', path: '/api/loyalty/balance' },
  { method: 'POST', path: '/api/messaging/opt-in' },
  { method: 'POST', path: '/api/loyalty/cron/expire' },
  { method: 'POST', path: '/api/billing/cron/meter-overage' },
  { method: 'POST', path: '/api/reporting/cron/daily-rollups' },
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
      requestInit(
        method,
        { 'content-type': 'application/json' },
        method === 'POST' || method === 'PATCH',
      ),
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
          method === 'POST' || method === 'PATCH',
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
