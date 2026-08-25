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
  { method: 'GET', path: '/api/pos/day-sales' },
  { method: 'POST', path: '/api/sales/layaways' },
  { method: 'POST', path: '/api/sales/layaways/deposit' },
  { method: 'POST', path: '/api/sales/layaways/convert' },
  { method: 'POST', path: '/api/sales/layaways/cancel' },
  { method: 'GET', path: '/api/owner/layaways/overdue' },
  { method: 'GET', path: '/api/owner/rc-pending-banner' },
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
  { method: 'PATCH', path: '/api/inventory/serials/tracking' },
  { method: 'GET', path: '/api/inventory/serials?serialNumber=SN-1' },
  { method: 'POST', path: '/api/inventory/serials/manifests' },
  { method: 'POST', path: '/api/inventory/serials/leases' },
  { method: 'POST', path: '/api/inventory/serials/disposition' },
  { method: 'GET', path: '/api/owner/transfers/pending' },
  { method: 'POST', path: '/api/cash/expenses' },
  { method: 'POST', path: '/api/orders' },
  { method: 'POST', path: '/api/orders/fire' },
  { method: 'POST', path: '/api/orders/items/ready' },
  { method: 'POST', path: '/api/orders/items/cancel' },
  { method: 'POST', path: '/api/orders/split' },
  { method: 'GET', path: '/api/orders/kds-pending' },
  { method: 'POST', path: '/api/kds/ws-ticket' },
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
  { method: 'POST', path: '/api/backups' },
  { method: 'GET', path: '/api/backups' },
  { method: 'GET', path: '/api/backups/backup-1' },
  { method: 'GET', path: '/api/backups/backup-1/download' },
  { method: 'POST', path: '/api/backups/backup-1/restore-dry-run' },
  { method: 'GET', path: '/api/customers' },
  { method: 'GET', path: '/api/customers/c1/consents' },
  { method: 'POST', path: '/api/customers/c1/consent' },
  { method: 'GET', path: '/api/customers/c1/export' },
  { method: 'POST', path: '/api/customers/c1/erase' },
  // Rutas de sprints posteriores (paridad con app.routes; Sprint 2 exige 100%)
  { method: 'GET', path: '/api/auth/session' },
  { method: 'POST', path: '/api/v1/sync/sales' },
  { method: 'POST', path: '/api/fiscal/void-boleta' },
  { method: 'GET', path: '/api/fiscal/owner-alerts' },
  { method: 'GET', path: '/api/fiscal/owner-backlog' },
  { method: 'POST', path: '/api/fiscal/credit-note-ea' },
  { method: 'GET', path: '/api/fiscal/tenant-cert' },
  { method: 'POST', path: '/api/fiscal/tenant-cert' },
  { method: 'POST', path: '/api/fiscal/cron' },
  { method: 'POST', path: '/api/cash/sessions/blind-close' },
  { method: 'POST', path: '/api/cash/movements' },
  { method: 'POST', path: '/api/cash/reprints' },
  { method: 'POST', path: '/api/cash/authz-token' },
  { method: 'POST', path: '/api/sales/returns' },
  { method: 'GET', path: '/api/sales/returns/policy' },
  { method: 'GET', path: '/api/sales/returns' },
  { method: 'PUT', path: '/api/sales/returns/policy' },
  { method: 'POST', path: '/api/sales/debit-notes' },
  { method: 'POST', path: '/api/inventory/remission-guides' },
  { method: 'POST', path: '/api/fiscal/perceptions' },
  { method: 'POST', path: '/api/fiscal/retentions' },
  { method: 'POST', path: '/api/backups/step-up-token' },
  { method: 'GET', path: '/api/cash/policy' },
  { method: 'PATCH', path: '/api/cash/policy' },
  { method: 'GET', path: '/api/orders/customer-orders' },
  { method: 'GET', path: '/api/orders/customer-orders/co1' },
  { method: 'GET', path: '/api/admin/recurring-plans' },
  { method: 'GET', path: '/api/admin/recurring-plans/rp1' },
  { method: 'GET', path: '/api/admin/recurring-plans/rp1/occurrences' },
  { method: 'GET', path: '/api/admin/recurring-plans/rp1/preview' },
  { method: 'POST', path: '/api/admin/recurring-plans' },
  { method: 'PUT', path: '/api/admin/recurring-plans/rp1' },
  { method: 'POST', path: '/api/admin/recurring-plans/rp1/pause' },
  { method: 'POST', path: '/api/admin/recurring-plans/rp1/resume' },
  { method: 'POST', path: '/api/admin/recurring-plans/rp1/cancel-preview' },
  { method: 'POST', path: '/api/admin/recurring-plans/rp1/cancel' },
  { method: 'POST', path: '/api/purchasing/invoices/match' },
  { method: 'GET', path: '/api/owner/purchasing/three-way' },
  { method: 'GET', path: '/api/pricing/promotions' },
  { method: 'POST', path: '/api/pricing/promotions' },
  { method: 'PATCH', path: '/api/pricing/promotions/p1' },
  { method: 'POST', path: '/api/catalog/quick-add' },
  { method: 'GET', path: '/api/catalog/scan/abc123' },
  { method: 'POST', path: '/api/cash/shifts/pin' },
  { method: 'POST', path: '/api/cash/shifts/transfer' },
  { method: 'POST', path: '/api/team/invites' },
  { method: 'POST', path: '/api/team/resolve' },
  { method: 'GET', path: '/api/onboarding/setup-progress' },
  { method: 'POST', path: '/api/growth/events' },
  { method: 'GET', path: '/api/growth/events' },
  { method: 'GET', path: '/api/catalog/variants-uom' },
  { method: 'GET', path: '/api/catalog/sellable' },
  { method: 'GET', path: '/api/catalog/export' },
  { method: 'GET', path: '/api/sales/export' },
  { method: 'GET', path: '/api/sales/sale-1/cpe-link' },
  { method: 'PATCH', path: '/api/catalog/variants/v1' },
  { method: 'POST', path: '/api/catalog/uoms' },
  { method: 'POST', path: '/api/inventory/counts' },
  { method: 'GET', path: '/api/inventory/scale/devices' },
  { method: 'POST', path: '/api/inventory/scale/devices' },
  { method: 'POST', path: '/api/inventory/scale/terminal-sessions' },
  { method: 'POST', path: '/api/inventory/scale/devices/heartbeat' },
  { method: 'POST', path: '/api/inventory/scale/diagnostics' },
  { method: 'POST', path: '/api/inventory/scale/devices/disable' },
  { method: 'PUT', path: '/api/inventory/scale/policy' },
  { method: 'POST', path: '/api/inventory/scale/authorize-manual' },
  { method: 'POST', path: '/api/inventory/scale/measurements' },
  { method: 'POST', path: '/api/hardware/diagnostics' },
  { method: 'GET', path: '/api/hardware/diagnostics' },
  { method: 'GET', path: '/api/catalog/price-labels/templates' },
  { method: 'POST', path: '/api/catalog/price-labels/templates' },
  { method: 'POST', path: '/api/catalog/price-labels/templates/retire' },
  { method: 'POST', path: '/api/catalog/price-labels/batches' },
  { method: 'POST', path: '/api/catalog/price-labels/batches/reprint' },
  { method: 'POST', path: '/api/catalog/price-labels/batches/ack' },
  { method: 'POST', path: '/api/inventory/counts/submit-review' },
  { method: 'POST', path: '/api/inventory/counts/approve' },
  { method: 'POST', path: '/api/inventory/losses' },
  { method: 'POST', path: '/api/inventory/losses/approve' },
  { method: 'POST', path: '/api/inventory/losses/reject' },
  { method: 'GET', path: '/api/owner/stock-alerts' },
  { method: 'POST', path: '/api/push/consents' },
  { method: 'DELETE', path: '/api/push/consents' },
  { method: 'POST', path: '/api/push/subscriptions' },
  { method: 'PUT', path: '/api/push/subscriptions/rotate' },
  { method: 'DELETE', path: '/api/push/subscriptions' },
  { method: 'GET', path: '/api/push/devices' },
  { method: 'PATCH', path: '/api/push/privacy' },
  { method: 'GET', path: '/api/push/privacy' },
  { method: 'PUT', path: '/api/push/privacy-policy' },
  { method: 'POST', path: '/api/push/test' },
  { method: 'POST', path: '/api/push/ack' },
  { method: 'GET', path: '/api/reports/advanced/r1' },
  { method: 'GET', path: '/api/reports/r1' },
  { method: 'GET', path: '/api/payments/captures/cap2' },
  { method: 'DELETE', path: '/api/integrations/api-keys/k2' },
  { method: 'DELETE', path: '/api/integrations/webhooks/ep2' },
  { method: 'GET', path: '/api/forecasting/alerts/b1' },
  { method: 'GET', path: '/api/forecasting/b1' },
  { method: 'POST', path: '/api/forecasting/refresh/b1' },
  { method: 'POST', path: '/api/customers/c1/consent' },
  { method: 'POST', path: '/api/customers/c1/erase' },
  { method: 'POST', path: '/api/orders/customer-orders' },
  { method: 'POST', path: '/api/orders/customer-orders/leases' },
  { method: 'POST', path: '/api/orders/customer-orders/fulfill' },
  { method: 'POST', path: '/api/orders/customer-orders/cancel' },
  { method: 'POST', path: '/api/orders/customer-orders/expire' },
  { method: 'POST', path: '/api/orders/customer-orders/reprice-authorizations' },
  { method: 'POST', path: '/api/orders/customer-orders/reprice-handoff' },
  { method: 'POST', path: '/api/orders/customer-orders/notices/dispatch' },
  { method: 'POST', path: '/api/inventory/serials/leases/release' },
  { method: 'POST', path: '/api/dr/simulation' },
  { method: 'POST', path: '/api/insights/chat' },
  { method: 'GET', path: '/api/insights/briefing' },
  { method: 'PATCH', path: '/api/tenant/formalization' },
  { method: 'PATCH', path: '/api/tenant/plan' },
  { method: 'POST', path: '/api/tenant/cancel' },
  { method: 'POST', path: '/api/tenant/billing-portal' },
  { method: 'POST', path: '/api/tenant/checkout-session' },
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

/**
 * Normaliza un template Hono (app.routes) a la forma canónica de la matriz:
 *  - `/api/backups/:id`        → `/api/backups/*`
 *  - `/api/catalog/scan/:raw`  → `/api/catalog/scan/*`
 *  - `/api/reports/advanced/:reportId` → `/api/reports/advanced/*`
 * La matriz puede usar un path concreto (`/api/backups/backup-1`) o el mismo
 * wildcard; lo importante es que el prefijo estático coincida.
 */
function normalizeTemplate(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '*' : segment))
    .join('/');
}

/**
 * Un template registrado (`/api/backups/:id` → `/api/backups/*`) está cubierto
 * por una entrada de la matriz si los segmentos estáticos coinciden; donde el
 * template declara un wildcard (param), la matriz puede tener cualquier valor
 * concreto. Las query strings de la matriz no participan de la comparación.
 */
function templateCoveredByMatrix(templateNormalized: string, matrixPath: string): boolean {
  const templateSegments = templateNormalized.split('?')[0]!.split('/').filter(Boolean);
  const matrixSegments = matrixPath.split('?')[0]!.split('/').filter(Boolean);
  if (templateSegments.length !== matrixSegments.length) return false;
  for (let i = 0; i < templateSegments.length; i += 1) {
    const t = templateSegments[i]!;
    if (t === '*') continue;
    if (t !== matrixSegments[i]) return false;
  }
  return true;
}

interface RegisteredRoute {
  method: string;
  path: string;
}

/** Índice del último ALL /api/* (JWT+Plan Guard); lib TS del worker no incluye findLastIndex. */
function lastApiMiddlewareIndex(routes: readonly RegisteredRoute[]): number {
  for (let i = routes.length - 1; i >= 0; i -= 1) {
    const r = routes[i]!;
    if (r.method === 'ALL' && r.path === '/api/*') return i;
  }
  return -1;
}

/** Rutas /api/* registradas en el router real (fuente de verdad de paridad). */
function registeredApiRoutes(app: ReturnType<typeof createApp>): string[] {
  const routes: RegisteredRoute[] = (app as unknown as { routes: RegisteredRoute[] }).routes;
  // El último ALL /api/* es JWT+Plan Guard. CORS y GET /api/kds/ws (ticket
  // one-shot, sin Bearer) se registran antes y no entran a esta matriz.
  const middlewareIndex = lastApiMiddlewareIndex(routes);
  const protectedRoutes = middlewareIndex >= 0 ? routes.slice(middlewareIndex) : routes;
  return protectedRoutes
    .filter((r) => r.path.startsWith('/api/') && r.method !== 'ALL' && r.method !== 'OPTIONS')
    .map((r) => `${r.method} ${normalizeTemplate(r.path)}`);
}

describe('matriz rutas protegidas worker-api', () => {
  it('catálogo de rutas /api/* cubiertas por esta suite', () => {
    expect(PROTECTED_ROUTES.length).toBeGreaterThan(0);
  });

  it('PARIDAD: toda ruta /api/* registrada tiene cobertura en la matriz (Sprint 2)', () => {
    const app = createApp(authed);
    const registered = registeredApiRoutes(app);
    const matrix = PROTECTED_ROUTES.map((r) => ({
      method: r.method,
      path: r.path,
    }));
    const uncovered = registered.filter((registeredRoute) => {
      const [method, path] = registeredRoute.split(' ');
      return !matrix.some(
        (m) => m.method === method && templateCoveredByMatrix(path ?? '', m.path),
      );
    });
    expect(uncovered).toEqual([]);
  });

  it('PARIDAD INVERSA: toda ruta de la matriz está registrada en el router (fe de errata authz-token/step-up/returns-policy)', () => {
    const app = createApp(authed);
    const registered = new Set(registeredApiRoutes(app));
    const missing = PROTECTED_ROUTES.filter((r) => {
      const normalized = `${r.method} ${normalizeTemplate(r.path)}`;
      return (
        !registered.has(normalized) &&
        !registered.has(`${r.method} ${r.path}`) &&
        ![...registered].some((entry) => {
          const [method, path] = entry.split(' ');
          return method === r.method && templateCoveredByMatrix(path ?? '', r.path);
        })
      );
    });
    expect(missing).toEqual([]);
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
