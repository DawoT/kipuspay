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
import { runBlindCloseHttp, runCashMovementHttp, runSaleReprintHttp } from './cash/cash-routes.js';
import {
  runCancelOrderItemHttp,
  runCreateOrderHttp,
  runFireOrderHttp,
  runKdsWebSocketHttp,
  runMarkItemsReadyHttp,
  runSplitBillHttp,
} from './orders/order-routes.js';
import {
  runCancelTransferHttp,
  runCreateTransferHttp,
  runOwnerPendingTransfersHttp,
  runPartialReceivePoHttp,
  runReceiveTransferHttp,
  runShipTransferHttp,
} from './inventory/transfer-receive-routes.js';
import {
  runOwnerUncapturedPaymentsHttp,
  runPaymentCaptureGetHttp,
  runPaymentChargeHttp,
  runPaymentWebhookHttp,
} from './payments/payment-routes.js';
import {
  runApproveCountHttp,
  runApproveStockLossHttp,
  runCreateInventoryCountHttp,
  runCreateStockLossHttp,
  runOwnerStockAlertsHttp,
  runRejectStockLossHttp,
  runSubmitCountReviewHttp,
} from './inventory/inventory-ops-routes.js';
import { runSendOwnerPushHttp, runSubscribePushHttp } from './owner/push-routes.js';
import {
  isAdvancedReportId,
  runDailyRollupsCronHttp,
  runReportHttp,
  runReportsCatalogHttp,
} from './reports/report-routes.js';
import { runBootstrapHttp, runFormalizationStageHttp } from './onboarding/onboarding-routes.js';
import {
  runCaptureReferralHttp,
  runEnsureReferralCodeHttp,
  runFirstSaleReferralHttp,
} from './referrals/referral-routes.js';
import { runCatalogImportHttp } from './integrations/catalog-import-routes.js';
import {
  runAccountingExportHttp,
  runCreateApiKeyHttp,
  runCreateWebhookEndpointHttp,
  runDeleteWebhookEndpointHttp,
  runDrainWebhookDeliveriesHttp,
  runListApiKeysHttp,
  runListWebhookEndpointsHttp,
  runPublicDocumentsListHttp,
  runPublicSalesListHttp,
  runRevokeApiKeyHttp,
} from './integrations/integration-routes.js';

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
  // Sprint 17 — caja dura (FEATURE_CASH_BLIND_Z, ADR-0012)
  app.post('/api/cash/sessions/blind-close', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runBlindCloseHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 409 | 422 | 503);
  });
  app.post('/api/cash/movements', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCashMovementHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.post('/api/cash/reprints', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runSaleReprintHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });

  // Sprint 19 — comandas / KDS / split
  app.post('/api/orders', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateOrderHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/orders/fire', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runFireOrderHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/orders/items/ready', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runMarkItemsReadyHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/orders/items/cancel', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCancelOrderItemHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.post('/api/orders/split', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runSplitBillHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.get('/api/kds/ws', async (c) => {
    const jwt = c.get('jwt');
    const branchId = c.req.query('branchId') ?? '';
    return runKdsWebSocketHttp(c.env, jwt?.tenantId ?? '', branchId, c.req.raw);
  });

  // Sprint 20 — transferencias / recepción parcial
  app.post('/api/inventory/transfers', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateTransferHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 404 | 422 | 503);
  });
  app.post('/api/inventory/transfers/ship', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runShipTransferHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/inventory/transfers/receive', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runReceiveTransferHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/inventory/transfers/cancel', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCancelTransferHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/purchasing/orders/partial-receive', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runPartialReceivePoHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.get('/api/owner/transfers/pending', async (c) => {
    const jwt = c.get('jwt');
    const result = await runOwnerPendingTransfersHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
  });

  // Sprint 18 — conteo / merma / alertas stock
  app.post('/api/inventory/counts', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateInventoryCountHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });
  app.post('/api/inventory/counts/submit-review', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runSubmitCountReviewHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/inventory/counts/approve', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runApproveCountHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.post('/api/inventory/losses', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateStockLossHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 404 | 422 | 503);
  });
  app.post('/api/inventory/losses/approve', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runApproveStockLossHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/inventory/losses/reject', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runRejectStockLossHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 404 | 422 | 503);
  });
  app.get('/api/owner/stock-alerts', async (c) => {
    const jwt = c.get('jwt');
    const result = await runOwnerStockAlertsHttp(c.env, jwt?.tenantId ?? '', {
      branchId: c.req.query('branchId') ?? '',
      expiryWarnDays: Number(c.req.query('expiryWarnDays') ?? '30'),
    });
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
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
  const reportQueryOpts = (c: {
    req: { query: (k: string) => string | undefined };
  }): { reportDate: string; format?: string; branchId?: string } => {
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

  // Sprint 22 — cobro local POS (no confundir con Stripe billing SaaS)
  app.post('/api/payments/charge', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runPaymentChargeHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.get('/api/payments/captures/:id', async (c) => {
    const jwt = c.get('jwt');
    const result = await runPaymentCaptureGetHttp(c.env, jwt?.tenantId ?? '', c.req.param('id'));
    return c.json(result.body, result.status as 200 | 404 | 503);
  });
  app.get('/api/owner/payments/uncaptured', async (c) => {
    const jwt = c.get('jwt');
    const result = await runOwnerUncapturedPaymentsHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
  });

  // Sprint 21 — importación de catálogo Bsale/Alegra/CSV (FEATURE_CATALOG_IMPORT, FASE 7 §5.4)
  app.post('/api/integrations/catalog-import', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runCatalogImportHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });

  // Sprint 23 — Contador + API keys/webhooks (Cadena+)
  app.post('/api/integrations/accounting/export', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runAccountingExportHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    if (typeof result.body === 'string') {
      return c.body(result.body, result.status as 200, {
        'content-type': result.contentType ?? 'text/plain; charset=utf-8',
      });
    }
    return c.json(result.body, result.status as 400 | 403 | 404 | 422 | 503);
  });
  app.get('/api/integrations/api-keys', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListApiKeysHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 403 | 404 | 503);
  });
  app.post('/api/integrations/api-keys', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runCreateApiKeyHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
    );
    return c.json(result.body, result.status as 201 | 403 | 404 | 503);
  });
  app.delete('/api/integrations/api-keys/:id', async (c) => {
    const jwt = c.get('jwt');
    const result = await runRevokeApiKeyHttp(c.env, jwt?.tenantId ?? '', c.req.param('id'));
    return c.json(result.body, result.status as 200 | 403 | 404 | 503);
  });
  app.get('/api/integrations/webhooks', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListWebhookEndpointsHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 403 | 404 | 503);
  });
  app.post('/api/integrations/webhooks', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runCreateWebhookEndpointHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 422 | 503);
  });
  app.delete('/api/integrations/webhooks/:id', async (c) => {
    const jwt = c.get('jwt');
    const result = await runDeleteWebhookEndpointHttp(
      c.env,
      jwt?.tenantId ?? '',
      c.req.param('id'),
    );
    return c.json(result.body, result.status as 200 | 403 | 404 | 503);
  });
  app.post('/api/integrations/webhooks/drain', async (c) => {
    const user = c.get('user');
    const result = await runDrainWebhookDeliveriesHttp(c.env, 20, user?.userId ?? '', user?.role);
    return c.json(result.body, result.status as 200 | 403 | 404 | 503);
  });

  // Public API (API key) — Cadena+; no JWT middleware
  app.get('/v1/sales', async (c) => {
    const result = await runPublicSalesListHttp(c.env, c.req.header('authorization'));
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.get('/v1/documents', async (c) => {
    const result = await runPublicDocumentsListHttp(c.env, c.req.header('authorization'));
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
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

  // Onboarding Sprint 11: bootstrap publico (soft-launch) + stage tras auth.
  app.post('/v1/onboarding/bootstrap', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = runBootstrapHttp(c.env, raw);
    if (result.status === 201 && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      if (typeof o.ref === 'string' && o.ref && typeof result.body.tenantId === 'string') {
        runCaptureReferralHttp(c.env, {
          referredTenantId: result.body.tenantId,
          ref: o.ref,
        });
      }
    }
    return c.json(result.body, result.status as 201 | 400 | 422);
  });

  app.patch('/api/tenant/formalization', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = runFormalizationStageHttp(c.env, raw);
    return c.json(result.body, result.status as 200 | 400 | 422);
  });

  // Sprint 12 — referidos (soft-launch in-memory; DDL 0010 = contrato D1)
  app.post('/v1/referrals/code', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = runEnsureReferralCodeHttp(c.env, raw);
    return c.json(result.body, result.status as 200 | 400 | 422);
  });

  app.post('/v1/referrals/capture', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = runCaptureReferralHttp(c.env, raw);
    return c.json(result.body, result.status as 201 | 400 | 422);
  });

  app.post('/v1/referrals/first-sale', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = runFirstSaleReferralHttp(c.env, raw);
    return c.json(result.body, result.status as 200 | 400 | 422);
  });

  // POS acquirer webhooks (Sprint 22) — distinct from Stripe SaaS billing.
  // Fuera de /api/* (sin JWT) y con ventana anti-replay fail-closed: el
  // header x-kipus-timestamp es OBLIGATORIO (nunca se auto-satisface).
  app.post('/v1/webhooks/payments/:acquirer', async (c) => {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header('x-kipus-signature') ?? '';
    const tsHeader = c.req.header('x-kipus-timestamp');
    if (tsHeader === undefined || tsHeader === null || tsHeader.trim() === '') {
      return c.json({ error: 'MISSING_WEBHOOK_TIMESTAMP', code: 'MISSING_WEBHOOK_TIMESTAMP' }, 400);
    }
    const timestampSec = Number(tsHeader);
    if (!Number.isFinite(timestampSec)) {
      return c.json(
        // eslint-disable-next-line no-secrets/no-secrets -- código de error, no un secret
        { error: 'INVALID_WEBHOOK_TIMESTAMP', code: 'INVALID_WEBHOOK_TIMESTAMP' },
        400,
      );
    }
    const result = await runPaymentWebhookHttp(
      c.env,
      c.req.param('acquirer'),
      rawBody,
      signatureHeader,
      timestampSec,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });

  // Stripe webhooks: raw body + firma; sin JWT (Arquitectura §4). Billing SaaS only.
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
