import { Hono } from 'hono';
import { buildSaleTotals, type OfflineSalePayload, type SaleLine } from '@kipuspay/domain-sales';
import type { AuthTenantSnapshot } from './auth/auth-decide.js';
import {
  createTenantAndAuthMiddleware,
  defaultFailClosedDeps,
  type TenantAuthDeps,
  type VerifiedJwtClaims,
} from './auth/tenant-auth-middleware.js';
import type { UserSession } from './auth/idp-user.js';
import type { WorkerEnv } from './auth/control-plane.js';
import { handleStripeWebhook } from './webhooks/handle-stripe-webhook.js';
import { runOfflineSaleHttp } from './pos/offline-sale-route.js';
import { runSyncSalesHttp } from './pos/sync-sales-route.js';
import {
  runCpePortalHttp,
  runFiscalCronHttp,
  runOwnerAlertsHttp,
  runVoidBoletaHttp,
} from './fiscal/fiscal-rc-routes.js';
import {
  runCreateApHttp,
  runCreateExpenseHttp,
  runCreatePoHttp,
  runListApHttp,
  runListArHttp,
  runOwnerDaySummaryHttp,
  runPayApHttp,
  runPayArHttp,
  runTransitionPoHttp,
} from './ledger/ledger-routes.js';
import { runSendOwnerPushHttp, runSubscribePushHttp } from './owner/push-routes.js';
import {
  isAdvancedReportId,
  runDailyRollupsCronHttp,
  runReportHttp,
  runReportsCatalogHttp,
} from './reports/report-routes.js';

export type { WorkerEnv as Env };

interface AppEnv {
  Bindings: WorkerEnv;
  Variables: {
    tenant: AuthTenantSnapshot;
    jwt: VerifiedJwtClaims;
    user?: UserSession;
  };
}

export function createApp(authDeps: TenantAuthDeps = defaultFailClosedDeps()) {
  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Rutas protegidas: auth fail-closed + Plan Guard (Sprint 2).
  app.use('/api/*', createTenantAndAuthMiddleware(authDeps));

  app.post('/api/pos/totals', async (c) => {
    const body: { lines?: readonly SaleLine[] } = await c.req.json();
    const lines = body.lines ?? [];
    return c.json(buildSaleTotals(lines));
  });

  // Motor ACID offline (Sprint 4) — detrás de FEATURE_ACID_OFFLINE_SALE (§5.1).
  app.post('/api/pos/offline-sale', async (c) => {
    const jwt = c.get('jwt') as { tenantId: string; sub: string } | undefined;
    const user = c.get('user');
    const tenantId = jwt?.tenantId ?? '';
    const userId = user?.userId ?? jwt?.sub ?? '';
    let payload: OfflineSalePayload;
    try {
      const raw: unknown = await c.req.json();
      payload = raw as OfflineSalePayload;
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = await runOfflineSaleHttp(c.env, tenantId, userId, payload);
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });

  // Offline sync batch (SYN-07) — FEATURE_OFFLINE_SYNC
  app.post('/api/v1/sync/sales', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const tenantId = jwt?.tenantId ?? '';
    const userId = user?.userId ?? jwt?.sub ?? '';
    const body: { sales?: Parameters<typeof runSyncSalesHttp>[3]['sales'] } = await c.req.json();
    const result = await runSyncSalesHttp(c.env, tenantId, userId, body);
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });

  // Fiscal RC — void boleta / alertas / portal / cron RC+plazos
  app.post('/api/fiscal/void-boleta', async (c) => {
    const jwt = c.get('jwt');
    const tenantId = jwt?.tenantId ?? '';
    const body: { saleId?: string } = await c.req.json();
    const result = await runVoidBoletaHttp(c.env, tenantId, body.saleId ?? '');
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });

  app.get('/api/fiscal/owner-alerts', async (c) => {
    const jwt = c.get('jwt');
    const result = await runOwnerAlertsHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
  });

  app.post('/api/fiscal/cron', async (c) => {
    const body: {
      action: 'deadlines' | 'daily-summary';
      tenantId?: string;
      summaryDate?: string;
      nowMs?: number;
    } = await c.req.json();
    const result = await runFiscalCronHttp(c.env, body);
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });

  // Ledger CxC/CxP/OC/egresos + Modo Dueño read (Sprint 8) — flags default off
  app.get('/api/ledger/ar', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListArHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
  });
  app.post('/api/ledger/ar/pay', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runPayArHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.get('/api/ledger/ap', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListApHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
  });
  app.post('/api/ledger/ap', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runCreateApHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 404 | 422 | 503);
  });
  app.post('/api/ledger/ap/pay', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runPayApHttp(c.env, jwt?.tenantId ?? '', body as Record<string, unknown>);
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/purchasing/orders', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreatePoHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });
  app.post('/api/purchasing/orders/transition', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runTransitionPoHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/cash/expenses', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateExpenseHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 404 | 422 | 503);
  });
  app.get('/api/owner/day-summary', async (c) => {
    const jwt = c.get('jwt');
    const date = c.req.query('date') ?? '';
    const result = await runOwnerDaySummaryHttp(c.env, jwt?.tenantId ?? '', date);
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });
  app.post('/api/owner/push/subscribe', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runSubscribePushHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });
  app.post('/api/owner/push/send', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runSendOwnerPushHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 404 | 503);
  });

  // Reporting rollups / catálogo / CSV (Sprint 9) — flags default off
  const reportQueryOpts = (
    c: { req: { query: (k: string) => string | undefined } },
  ): { reportDate: string; format?: string; branchId?: string } => {
    const opts: { reportDate: string; format?: string; branchId?: string } = {
      reportDate: c.req.query('date') ?? '',
    };
    const format = c.req.query('format');
    if (format) opts.format = format;
    const branchId = c.req.query('branchId');
    if (branchId) opts.branchId = branchId;
    return opts;
  };
  app.get('/api/reports/catalog', (c) => {
    const result = runReportsCatalogHttp(c.env);
    return c.json(result.body, result.status as 200 | 404);
  });
  app.get('/api/reports/advanced/:reportId', async (c) => {
    const jwt = c.get('jwt');
    const reportId = c.req.param('reportId');
    if (!isAdvancedReportId(reportId)) {
      return c.json({ error: 'Not an advanced report', code: 'NOT_FOUND' }, 404);
    }
    const result = await runReportHttp(c.env, jwt?.tenantId ?? '', reportId, reportQueryOpts(c));
    if (typeof result.body === 'string') {
      return c.body(result.body, result.status as 200, {
        'content-type': result.contentType ?? 'text/csv; charset=utf-8',
      });
    }
    return c.json(result.body, result.status as 200 | 400 | 404 | 500 | 503);
  });
  app.get('/api/reports/:reportId', async (c) => {
    const jwt = c.get('jwt');
    const reportId = c.req.param('reportId');
    if (isAdvancedReportId(reportId)) {
      return c.json({ error: 'Use /api/reports/advanced/' + reportId, code: 'USE_ADVANCED' }, 404);
    }
    const result = await runReportHttp(c.env, jwt?.tenantId ?? '', reportId, reportQueryOpts(c));
    if (typeof result.body === 'string') {
      return c.body(result.body, result.status as 200, {
        'content-type': result.contentType ?? 'text/csv; charset=utf-8',
      });
    }
    return c.json(result.body, result.status as 200 | 400 | 404 | 500 | 503);
  });
  app.post('/api/reporting/cron/daily-rollups', async (c) => {
    let body: { scheduledTimeMs?: number } = {};
    try {
      const raw: unknown = await c.req.json();
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const o = raw as { scheduledTimeMs?: unknown };
        if (typeof o.scheduledTimeMs === 'number') {
          body = { scheduledTimeMs: o.scheduledTimeMs };
        }
      }
    } catch {
      body = {};
    }
    const result = await runDailyRollupsCronHttp(c.env, body);
    return c.json(result.body, result.status as 200 | 404 | 503);
  });

  // Portal CPE: auth por token (adquirente), fuera del JWT tenant.
  app.get('/v1/cpe/portal/:tenantId/:saleId', async (c) => {
    const token = c.req.query('token') ?? '';
    const result = await runCpePortalHttp(
      c.env,
      c.req.param('tenantId'),
      c.req.param('saleId'),
      token,
    );
    if (typeof result.body === 'string') {
      return c.body(result.body, result.status as 200, {
        'content-type': result.contentType ?? 'text/html; charset=utf-8',
      });
    }
    return c.json(result.body, result.status as 401 | 404 | 410 | 503);
  });

  // Stripe webhooks: raw body + firma; sin JWT (Arquitectura §4).
  app.post('/v1/webhooks/stripe', async (c) => {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header('stripe-signature') ?? undefined;
    const result = await handleStripeWebhook(c.env, rawBody, signatureHeader);
    return c.json(result.body, result.status as 200 | 400 | 401 | 503);
  });

  return app;
}

/** App con deps fail-closed (tests / sin bindings). El deploy usa `worker.ts`. */
const app = createApp();
export default app;
