import { Hono, type Context } from 'hono';
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
import { runAuthenticatedSessionHttp } from './auth/session-route.js';
import { runCashierLoginHttp } from './auth/cashier-login-route.js';
import { handleStripeWebhook } from './webhooks/handle-stripe-webhook.js';
import { runOfflineSaleHttp } from './pos/offline-sale-route.js';
import { runDaySalesHttp } from './pos/pos-day-sales-route.js';
import { runSyncSalesHttp } from './pos/sync-sales-route.js';
import {
  runCpePortalHttp,
  runFiscalCronHttp,
  runOwnerAlertsHttp,
  runRcPendingBannerHttp,
  runVoidBoletaHttp,
} from './fiscal/fiscal-rc-routes.js';
import { runCreditNoteEaHttp, runOwnerBacklogHttp } from './fiscal/owner-ea-routes.js';
import { parseCreditNoteEaBody } from './fiscal/parse-ea-body.js';
import { runMeterOverageCronHttp } from './billing/meter-overage-routes.js';
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
import {
  runBlindCloseHttp,
  runCashMovementHttp,
  runSaleReprintHttp,
  runAuthzTokenMintHttp,
} from './cash/cash-routes.js';
import { clientIp, enforceRateLimit, rateLimitKey } from './auth/rate-limit.js';
import {
  runCreateSalesReturnHttp,
  runGetReturnPolicyHttp,
  runListSalesReturnsHttp,
  runUpsertReturnPolicyHttp,
} from './sales/sales-returns-routes.js';
import {
  runCancelLayawayHttp,
  runConvertLayawayHttp,
  runCreateLayawayHttp,
  runDepositLayawayHttp,
  runListOverdueLayawaysHttp,
} from './sales/layaway-routes.js';
import {
  runApproveQuoteHttp,
  runCancelQuoteHttp,
  runConvertQuoteHttp,
  runCreateQuoteHttp,
  runListExpiredQuotesHttp,
  runSendQuoteHttp,
} from './sales/quote-routes.js';
import { runListJournalHttp, runMutateJournalHttp } from './ledger/journal-routes.js';
import {
  runAdjustStoreCreditHttp,
  runExpireStoreCreditHttp,
  runIssueStoreCreditHttp,
  runOwnerStoreCreditHttp,
} from './ledger/store-credit-routes.js';
import {
  runCreateInstallmentPlanHttp,
  runOwnerInstallmentsOverdueHttp,
  runPayInstallmentHttp,
} from './sales/installment-routes.js';
import {
  runCreateCommissionPayoutHttp,
  runListCommissionRatesHttp,
  runOwnerCommissionsHttp,
  runPayCommissionPayoutHttp,
  runUpsertCommissionRateHttp,
  runVoidCommissionPayoutHttp,
} from './sales/commission-routes.js';
import {
  runCancelOrderItemHttp,
  runCreateOrderHttp,
  runFireOrderHttp,
  runKdsWebSocketHttp,
  runMarkItemsReadyHttp,
  runMintKdsWsTicketHttp,
  consumeKdsWsTicket,
  runKdsPendingHttp,
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
  runMatchSupplierInvoiceHttp,
  runOwnerThreeWayReportHttp,
} from './purchasing/purchasing-three-way-routes.js';
import {
  runCancelSupplierReturnHttp,
  runCloseSupplierReturnHttp,
  runCreateSupplierReturnHttp,
  runOwnerSupplierReturnsHttp,
} from './purchasing/supplier-return-routes.js';
import {
  runCreatePromotionHttp,
  runListPromotionsHttp,
  runUpdatePromotionHttp,
} from './pricing/pricing-promotions-routes.js';
import {
  runListVariantsUomHttp,
  runUpdateVariantHttp,
  runUpsertProductUomHttp,
} from './catalog/catalog-variants-uom-routes.js';
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
import {
  runCreateInventoryLocationHttp,
  runDeactivateInventoryLocationHttp,
  runInventoryLocationPickingHttp,
  runInventoryLocationStockHttp,
  runInventoryLocationTransferHttp,
  runListInventoryLocationsHttp,
  runUpdateInventoryLocationHttp,
} from './inventory/inventory-location-routes.js';
import {
  runAcquireSerialLeaseHttp,
  runConfigureSerialTrackingHttp,
  runCreateSerialManifestHttp,
  runDisposeSerialHttp,
  runReleaseSerialLeaseHttp,
  runSearchSerialsHttp,
} from './inventory/inventory-serial-routes.js';
import {
  runAuthorizeManualWeightHttp,
  runConfigureWeightPolicyHttp,
  runDiagnoseScaleDeviceHttp,
  runDisableScaleDeviceHttp,
  runHeartbeatScaleDeviceHttp,
  runListScaleDevicesHttp,
  runRegisterScaleDeviceHttp,
  runRegisterTerminalSessionHttp,
  runSubmitWeightHttp,
} from './inventory/inventory-scale-routes.js';
import {
  runListHardwareDiagnosticsHttp,
  runReportHardwareDiagnosticsHttp,
  type HardwareDiagActor,
} from './hardware/hardware-diagnostics-routes.js';
import {
  runAcknowledgePriceLabelItemsHttp,
  runCreatePriceLabelBatchHttp,
  runListPriceLabelTemplatesHttp,
  runReprintPriceLabelBatchHttp,
  runRetirePriceLabelTemplateHttp,
  runUpsertPriceLabelTemplateHttp,
} from './catalog/price-label-routes.js';
import {
  acknowledgeDisplayedHttp,
  grantPushConsentHttp,
  listPushDevicesHttp,
  getPushPrivacyPolicyHttp,
  revokePushConsentHttp,
  revokePushDeviceHttp,
  rotatePushDeviceHttp,
  sendTestPushHttp,
  subscribePushDeviceHttp,
  updatePushPrivacyHttp,
  updatePushPrivacyPolicyHttp,
  type PushActor,
  type PushHttpResult,
} from './push/mobile-push-routes.js';
import {
  isAdvancedReportId,
  runDailyRollupsCronHttp,
  runReportHttp,
  runReportsCatalogHttp,
} from './reports/report-routes.js';
import {
  runBootstrapHttp,
  runFormalizationStageHttp,
  runOnboardingClaimHttp,
} from './onboarding/onboarding-routes.js';
import { runUpdatePlanHttp } from './tenant/plan-routes.js';
import { runCancelTenantHttp, runBillingPortalHttp } from './tenant/cancel-routes.js';
import { runCheckoutSessionHttp } from './tenant/checkout-routes.js';
import {
  runCreateReclamacionHttp,
  runListReclamacionesHttp,
  runRespondReclamacionHttp,
} from './legal/reclamaciones-routes.js';
import { corsHeadersFor } from './auth/public-cors.js';
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
import {
  runExpireLoyaltyCronHttp,
  runLoyaltyBalanceHttp,
  runLoyaltyReserveHttp,
  runMessagingOptInHttp,
} from './loyalty/loyalty-messaging-routes.js';
import {
  runEraseCustomerHttp,
  runExportCustomerHttp,
  runListConsentsHttp,
  runListCustomersHttp,
  runWriteConsentHttp,
  type LpdpActor,
} from './customers/customer-lpdp-routes.js';
import {
  runListForecastsHttp,
  runRefreshForecastHttp,
  runStockAlertsHttp,
} from './analytics/forecasting-routes.js';
import {
  runBackupStatusHttp,
  runCreateBackupHttp,
  runDownloadBackupHttp,
  runListBackupsHttp,
  runMintBackupStepUpTokenHttp,
  runRestoreDryRunHttp,
  type BackupActor,
  type BackupHttpResult,
} from './backup/backup-routes.js';
import { runDrSimulationHttp } from './backup/dr-routes.js';
import {
  runBriefingHttp,
  runInsightChatHttp,
  type InsightsEnv,
} from './analytics/insights-routes.js';
import { runQuickAddHttp, runScanLookupHttp } from './catalog/quick-add-routes.js';
import { runListSellableCatalogHttp } from './catalog/sellable-catalog-routes.js';
import { runExportCatalogCsvHttp, runExportSalesCsvHttp } from './catalog/catalog-export-routes.js';
import { runIssueShiftPinHttp, runShiftTransferHttp } from './cash/shift-routes.js';
import { runResolveSellerHttp, runTeamInviteHttp } from './team/team-routes.js';
import { runDebitNoteHttp } from './sales/debit-note-routes.js';
import { runRemissionGuideHttp } from './inventory/remission-guide-routes.js';
import { runPerceptionHttp, runRetentionHttp } from './fiscal/withholding-routes.js';
import { runGetCashPolicyHttp, runPatchCashPolicyHttp } from './cash/cash-policy-routes.js';
import {
  runGrowthEventHttp,
  runListGrowthEventsHttp,
  runSetupProgressHttp,
} from './onboarding/onboarding-routes.js';
import {
  runTitularConsentHttp,
  runTitularConsentsHttp,
  runTitularEraseHttp,
  runTitularExportHttp,
  runTitularVerifyHttp,
} from './customers/titular-lpdp-routes.js';
import {
  runCancelCustomerOrderHttp,
  runCreateCustomerOrderHttp,
  runDispatchCustomerOrderNoticeHttp,
  runExpireCustomerOrderHttp,
  runFulfillCustomerOrderHttp,
  runGetCustomerOrderHttp,
  runListCustomerOrdersHttp,
  runMintCustomerOrderLeaseHttp,
  runMintCustomerOrderRepriceAuthorizationHttp,
  runRepriceExpiredCustomerOrderHttp,
  type CustomerOrderActor,
} from './orders/customer-order-routes.js';
import {
  runCancelRecurringPlanHttp,
  runCreateRecurringPlanHttp,
  runGetRecurringPlanHttp,
  runListRecurringOccurrencesHttp,
  runListRecurringPlansHttp,
  runPauseRecurringPlanHttp,
  runPreviewRecurringCancellationHttp,
  runPreviewRecurringPlanHttp,
  runResumeRecurringPlanHttp,
  runUpdateRecurringPlanHttp,
  type RecurringSalesActor,
} from './sales/recurring-sales-routes.js';

export type { WorkerEnv as Env };

interface AppEnv {
  Bindings: WorkerEnv;
  Variables: {
    tenant: AuthTenantSnapshot;
    jwt: VerifiedJwtClaims;
    user?: UserSession;
  };
}

function trustedBackupActor(user: UserSession | undefined, jwt: VerifiedJwtClaims): BackupActor {
  return {
    tenantId: jwt.tenantId,
    userId: user?.userId ?? jwt.sub,
    role: user?.role ?? '',
    permissions: user?.permissions ?? [],
  };
}

function backupResponse(result: BackupHttpResult): Response {
  const body = result.body instanceof ReadableStream ? result.body : JSON.stringify(result.body);
  return new Response(body, { status: result.status, headers: result.headers });
}

function definedOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function objectBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trustedCustomerOrderActor(c: {
  get(name: 'jwt'): VerifiedJwtClaims | undefined;
  get(name: 'user'): UserSession | undefined;
  req: { header(name: string): string | undefined };
}): CustomerOrderActor {
  const jwt = c.get('jwt');
  const user = c.get('user');
  return {
    tenantId: definedOr(jwt?.tenantId, ''),
    userId: definedOr(user?.userId, definedOr(jwt?.sub, '')),
    role: definedOr(user?.role, ''),
    branchId: definedOr(user?.branchId, ''),
    allowedBranches: definedOr(user?.allowedBranches, []),
    permissions: definedOr(user?.permissions, []),
    terminalId: definedOr(c.req.header('x-terminal-id'), ''),
    terminalSessionId: definedOr(c.req.header('x-terminal-session-id'), ''),
  };
}

function trustedLpdpActor(c: {
  get(name: 'jwt'): VerifiedJwtClaims | undefined;
  get(name: 'user'): UserSession | undefined;
}): LpdpActor | undefined {
  const jwt = c.get('jwt');
  const user = c.get('user');
  if (!jwt?.tenantId) return undefined;
  const branchId = definedOr(user?.branchId, '');
  return {
    tenantId: jwt.tenantId,
    userId: definedOr(user?.userId, definedOr(jwt.sub, '')),
    role: definedOr(user?.role, ''),
    ...(branchId === '' ? {} : { branchId }),
  };
}

function trustedRecurringSalesActor(c: {
  get(name: 'jwt'): VerifiedJwtClaims | undefined;
  get(name: 'user'): UserSession | undefined;
}): RecurringSalesActor {
  const jwt = c.get('jwt');
  const user = c.get('user');
  return {
    tenantId: definedOr(jwt?.tenantId, ''),
    userId: definedOr(user?.userId, definedOr(jwt?.sub, '')),
    role: definedOr(user?.role, ''),
    branchId: definedOr(user?.branchId, ''),
    allowedBranches: definedOr(user?.allowedBranches, []),
    permissions: definedOr(user?.permissions, []),
  };
}

function trustedPushActor(c: {
  get(name: 'jwt'): VerifiedJwtClaims | undefined;
  get(name: 'user'): UserSession | undefined;
}): PushActor {
  const jwt = c.get('jwt');
  const user = c.get('user');
  return {
    tenantId: jwt?.tenantId ?? '',
    userId: user?.userId ?? jwt?.sub ?? '',
    role: user?.role ?? '',
    branchId: user?.branchId ?? '',
    ...(jwt?.authTime === undefined
      ? {}
      : { deviceFingerprint: `jwt-session:${jwt.tenantId}:${jwt.sub}:${jwt.authTime}` }),
  };
}

function pushResponse(result: PushHttpResult): Response {
  return result.status === 204
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      });
}

export function createApp(authDeps: TenantAuthDeps = defaultFailClosedDeps()) {
  const app = new Hono<AppEnv>();

  // M6B: CORS fail-closed (ALLOWED_ORIGINS). Antes de rutas públicas (incl.
  // /health) para que el navegador del POS/marketing pueda leer respuestas.
  const publicCorsMiddleware = async (
    c: Context<{ Bindings: WorkerEnv }>,
    next: () => Promise<void>,
  ) => {
    const origin = c.req.header('origin') ?? null;
    for (const [name, value] of Object.entries(
      corsHeadersFor(c.env as { ALLOWED_ORIGINS?: string }, origin),
    )) {
      c.header(name, value);
    }
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
    await next();
  };

  app.use('/health', publicCorsMiddleware);
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.use('/api/auth/cashier-login', publicCorsMiddleware);
  app.post('/api/auth/cashier-login', async (c) => {
    const result = await runCashierLoginHttp(
      c.env,
      (await c.req.json().catch(() => ({}))) as {
        tenantId?: unknown;
        identifier?: unknown;
        pin?: unknown;
      },
    );
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });

  app.use('/api/onboarding/claim', publicCorsMiddleware);

  // M6A: consumo del token de onboarding (single-use) — público como el login.
  app.post('/api/onboarding/claim', async (c) => {
    const raw: unknown = await c.req.json().catch(() => null);
    const token =
      raw && typeof raw === 'object' && typeof (raw as { token?: unknown }).token === 'string'
        ? (raw as { token: string }).token
        : '';
    const { decision } = await enforceRateLimit({
      kv: c.env?.TENANT_KV,
      key: rateLimitKey(clientIp(c.req.raw), 'claim'),
      limit: 20,
      windowSeconds: 3600,
    });
    if (!decision.allowed) {
      return c.json({ error: 'Too many attempts', code: 'RATE_LIMITED' }, 429);
    }
    const result = await runOnboardingClaimHttp(c.env, token);
    return c.json(result.body, result.status as 200 | 403 | 503);
  });

  // M6B: CORS fail-closed global en /api/* (preflight antes del auth).
  app.use('/api/*', publicCorsMiddleware);
  // Público /v1/* (API key, CPE portal, onboarding) — ANTES de los handlers
  // para que GET /v1/sales|documents|cpe lleven ACAO, no solo el OPTIONS.
  app.use('/v1/*', publicCorsMiddleware);

  // KDS WS: el browser no puede mandar Authorization en el handshake.
  // Ticket one-shot (POST /api/kds/ws-ticket, JWT) ANTES del middleware JWT.
  app.get('/api/kds/ws', async (c) => {
    const ticket = c.req.query('ticket') ?? '';
    const claimed = await consumeKdsWsTicket(c.env?.TENANT_KV, ticket, Date.now());
    if (!claimed) {
      return c.json({ error: 'KDS ticket required', code: 'UNAUTHENTICATED' }, 401);
    }
    const branchId = c.req.query('branchId') ?? claimed.branchId;
    if (branchId && branchId !== claimed.branchId) {
      return c.json({ error: 'branch mismatch', code: 'FORBIDDEN' }, 403);
    }
    return runKdsWebSocketHttp(c.env, claimed.tenantId, claimed.branchId, c.req.raw);
  });

  // LPDP ARCO self-serve del titular (Sprint C3): identidad por datos y
  // token de corta duración (scope lpdp_titular). Públicas ANTES del
  // middleware JWT; el verify no exige sesión admin pero sí rate-limit.
  app.post('/api/lpdp/titular/verify', async (c) => {
    const { decision } = await enforceRateLimit({
      kv: c.env?.TENANT_KV,
      key: rateLimitKey(clientIp(c.req.raw), 'lpdp-titular-verify'),
      limit: 30,
      windowSeconds: 3600,
    });
    if (!decision.allowed) {
      return c.json({ error: 'Too many attempts', code: 'RATE_LIMITED' }, 429);
    }
    const body: unknown = await c.req.json().catch(() => ({}));
    const result = await runTitularVerifyHttp(c.env, (body ?? {}) as Record<string, unknown>);
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.get('/api/lpdp/titular/export', async (c) => {
    const result = await runTitularExportHttp(c.env, c.req.header('authorization') ?? '');
    return c.json(result.body, result.status as 200 | 401 | 404 | 422 | 503);
  });
  app.get('/api/lpdp/titular/consents', async (c) => {
    const result = await runTitularConsentsHttp(c.env, c.req.header('authorization') ?? '');
    return c.json(result.body, result.status as 200 | 401 | 404 | 422 | 503);
  });
  app.post('/api/lpdp/titular/consent', async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}));
    const result = await runTitularConsentHttp(
      c.env,
      c.req.header('authorization') ?? '',
      (body ?? {}) as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/lpdp/titular/erase', async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}));
    const result = await runTitularEraseHttp(
      c.env,
      c.req.header('authorization') ?? '',
      (body ?? {}) as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });

  // Rutas protegidas: auth fail-closed + Plan Guard (Sprint 2).
  app.use('/api/*', createTenantAndAuthMiddleware(authDeps));

  app.get('/api/auth/session', async (c) => {
    const response = await runAuthenticatedSessionHttp(
      c.env,
      c.get('user'),
      c.req.header('x-terminal-id') ?? '',
      c.get('tenant'),
    );
    return c.json(response.body, response.status);
  });

  app.post('/api/pos/totals', async (c) => {
    const body: { lines?: readonly SaleLine[] } = await c.req.json();
    const lines = body.lines ?? [];
    return c.json(buildSaleTotals(lines));
  });

  // F3 — Historial del día del cajero (hora Lima, solo lectura, GTM §3.3).
  app.get('/api/pos/day-sales', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user') as { userId?: string; role?: string; branchId?: string } | undefined;
    const result = await runDaySalesHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role ?? '',
      user?.branchId ?? '',
    );
    return c.json(result.body, result.status as 200 | 403 | 503);
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
    const result = await runOfflineSaleHttp(
      c.env,
      tenantId,
      userId,
      payload,
      user?.role === 'admin' || user?.role === 'owner',
      c.req.header('x-terminal-id') ?? '',
      (task) => c.executionCtx.waitUntil(task),
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });

  // Offline sync batch (SYN-07) — FEATURE_OFFLINE_SYNC
  app.post('/api/v1/sync/sales', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const tenantId = jwt?.tenantId ?? '';
    const userId = user?.userId ?? jwt?.sub ?? '';
    const body: { sales?: Parameters<typeof runSyncSalesHttp>[3]['sales'] } = await c.req.json();
    const result = await runSyncSalesHttp(
      c.env,
      tenantId,
      userId,
      body,
      Date.now(),
      c.req.header('x-terminal-id') ?? '',
    );
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

  app.get('/api/fiscal/owner-backlog', async (c) => {
    const jwt = c.get('jwt');
    const result = await runOwnerBacklogHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
  });

  app.post('/api/fiscal/credit-note-ea', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body = parseCreditNoteEaBody(await c.req.json());
    const result = await runCreditNoteEaHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
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

  // F5b-5: banner Dueño "boletas del día sin RC ≠ cierre Z"
  app.get('/api/owner/rc-pending-banner', async (c) => {
    const jwt = c.get('jwt');
    const result = await runRcPendingBannerHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 404 | 503);
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
  // S17-H2: mint del token de autorización de caja (PIN supervisor/owner).
  app.post('/api/cash/authz-token', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runAuthzTokenMintHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      (await c.req.json().catch(() => null)) as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 422 | 503);
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

  // Backlog v10 P1a — Nota de Débito (FEATURE_SALES_DEBIT_NOTE, default-off).
  app.post('/api/sales/debit-notes', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runDebitNoteHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 201 | 400 | 404 | 422 | 503);
  });

  // Backlog v10 P1b — GRE (FEATURE_GRE, default-off).
  app.post('/api/inventory/remission-guides', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runRemissionGuideHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 201 | 400 | 404 | 422 | 503);
  });

  // Backlog v10 P1c — Percepciones/Retenciones (FEATURE_FISCAL_WITHHOLDINGS, default-off).
  app.post('/api/fiscal/perceptions', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runPerceptionHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 201 | 400 | 404 | 422 | 503);
  });
  app.post('/api/fiscal/retentions', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runRetentionHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 201 | 400 | 404 | 422 | 503);
  });

  // Backlog v10 P2 — políticas de caja (FEATURE_SALE_TIP/FEATURE_CASH_DRAWER, default-off).
  app.get('/api/cash/policy', async (c) => {
    const jwt = c.get('jwt');
    const result = await runGetCashPolicyHttp(c.env, {
      tenantId: jwt?.tenantId ?? '',
      userId: jwt?.sub ?? '',
      role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
    });
    return c.json(result.body, result.status as 200 | 404 | 503);
  });
  app.patch('/api/cash/policy', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runPatchCashPolicyHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 403 | 404 | 422 | 503);
  });

  // Sprint 28 — devoluciones (FEATURE_SALES_RETURNS); checkout-critical vía /api/sales/
  app.post('/api/sales/returns', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateSalesReturnHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.get('/api/sales/returns/policy', async (c) => {
    const jwt = c.get('jwt');
    const result = await runGetReturnPolicyHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 401 | 404 | 503);
  });
  // S28-H3: upsert de la política de devolución (admin/owner, auditado).
  app.put('/api/sales/returns/policy', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runUpsertReturnPolicyHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role ?? '',
      await c.req.json().catch(() => null),
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 422 | 503);
  });
  app.get('/api/sales/returns', async (c) => {
    const jwt = c.get('jwt');
    const saleId = c.req.query('saleId') ?? '';
    const result = await runListSalesReturnsHttp(c.env, jwt?.tenantId ?? '', saleId);
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 503);
  });

  // Sprint 32 — apartados (FEATURE_SALES_LAYAWAY)
  app.post('/api/sales/layaways', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateLayawayHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/layaways/deposit', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runDepositLayawayHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/layaways/convert', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runConvertLayawayHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/layaways/cancel', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCancelLayawayHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.get('/api/owner/layaways/overdue', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListOverdueLayawaysHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 401 | 404 | 503);
  });

  // Sprint 33 — cotizaciones (FEATURE_SALES_QUOTES)
  app.post('/api/sales/quotes', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateQuoteHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/quotes/send', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runSendQuoteHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/quotes/approve', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runApproveQuoteHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/quotes/convert', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runConvertQuoteHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/sales/quotes/cancel', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCancelQuoteHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.get('/api/owner/quotes/expired', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runListExpiredQuotesHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '');
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.get('/api/ledger/journal', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListJournalHttp(c.env, jwt?.tenantId ?? '', {
      fromDate: c.req.query('fromDate') ?? '',
      toDate: c.req.query('toDate') ?? '',
      branchId: c.req.query('branchId') ?? '',
    });
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });
  app.post('/api/ledger/journal', (c) => {
    const result = runMutateJournalHttp();
    return c.json(result.body, result.status as 403);
  });
  app.patch('/api/ledger/journal', (c) => {
    const result = runMutateJournalHttp();
    return c.json(result.body, result.status as 403);
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
  app.get('/api/orders/kds-pending', async (c) => {
    const jwt = c.get('jwt');
    const branchId = c.req.query('branchId') ?? '';
    const result = await runKdsPendingHttp(c.env, jwt?.tenantId ?? '', branchId);
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
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
  app.post('/api/kds/ws-ticket', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json().catch(() => ({}));
    const branchId =
      body &&
      typeof body === 'object' &&
      typeof (body as { branchId?: unknown }).branchId === 'string'
        ? (body as { branchId: string }).branchId
        : (c.req.query('branchId') ?? '');
    const result = await runMintKdsWsTicketHttp(c.env, jwt?.tenantId ?? '', branchId);
    return c.json(result.body, result.status as 200 | 400 | 404 | 503);
  });
  app.get('/api/orders/customer-orders', async (c) => {
    const branchId = c.req.query('branchId');
    const status = c.req.query('status');
    const response = await runListCustomerOrdersHttp(c.env, trustedCustomerOrderActor(c), {
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 500 | 503);
  });
  app.get('/api/orders/customer-orders/:id', async (c) => {
    const response = await runGetCustomerOrderHttp(
      c.env,
      trustedCustomerOrderActor(c),
      c.req.param('id'),
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 500 | 503);
  });
  app.post('/api/orders/customer-orders', async (c) => {
    const response = await runCreateCustomerOrderHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 201 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/leases', async (c) => {
    const response = await runMintCustomerOrderLeaseHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 201 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/fulfill', async (c) => {
    const response = await runFulfillCustomerOrderHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/cancel', async (c) => {
    const response = await runCancelCustomerOrderHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/expire', async (c) => {
    const response = await runExpireCustomerOrderHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/reprice-authorizations', async (c) => {
    const response = await runMintCustomerOrderRepriceAuthorizationHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 201 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/reprice-handoff', async (c) => {
    const response = await runRepriceExpiredCustomerOrderHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/orders/customer-orders/notices/dispatch', async (c) => {
    const response = await runDispatchCustomerOrderNoticeHttp(
      c.env,
      trustedCustomerOrderActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });

  // Sprint 44 — membresías. Solo Owner/Admin autenticados; importes siempre servidor.
  app.get('/api/admin/recurring-plans', async (c) => {
    const response = await runListRecurringPlansHttp(c.env, trustedRecurringSalesActor(c), {
      ...(c.req.query('branchId') ? { branchId: c.req.query('branchId') } : {}),
      ...(c.req.query('status') ? { status: c.req.query('status') } : {}),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 422 | 500 | 503);
  });
  app.get('/api/admin/recurring-plans/:id', async (c) => {
    const response = await runGetRecurringPlanHttp(c.env, trustedRecurringSalesActor(c), {
      planId: c.req.param('id'),
      ...(c.req.query('branchId') ? { branchId: c.req.query('branchId') } : {}),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 422 | 500 | 503);
  });
  app.get('/api/admin/recurring-plans/:id/occurrences', async (c) => {
    const response = await runListRecurringOccurrencesHttp(c.env, trustedRecurringSalesActor(c), {
      planId: c.req.param('id'),
      ...(c.req.query('branchId') ? { branchId: c.req.query('branchId') } : {}),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 422 | 500 | 503);
  });
  app.get('/api/admin/recurring-plans/:id/preview', async (c) => {
    const response = await runPreviewRecurringPlanHttp(c.env, trustedRecurringSalesActor(c), {
      planId: c.req.param('id'),
      ...(c.req.query('branchId') ? { branchId: c.req.query('branchId') } : {}),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/admin/recurring-plans', async (c) => {
    const response = await runCreateRecurringPlanHttp(
      c.env,
      trustedRecurringSalesActor(c),
      await c.req.json(),
    );
    return c.json(response.body, response.status as 201 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.put('/api/admin/recurring-plans/:id', async (c) => {
    const body = objectBody(await c.req.json());
    const response = await runUpdateRecurringPlanHttp(c.env, trustedRecurringSalesActor(c), {
      ...body,
      planId: c.req.param('id'),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/admin/recurring-plans/:id/pause', async (c) => {
    const response = await runPauseRecurringPlanHttp(c.env, trustedRecurringSalesActor(c), {
      ...objectBody(await c.req.json()),
      planId: c.req.param('id'),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/admin/recurring-plans/:id/resume', async (c) => {
    const response = await runResumeRecurringPlanHttp(c.env, trustedRecurringSalesActor(c), {
      ...objectBody(await c.req.json()),
      planId: c.req.param('id'),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/admin/recurring-plans/:id/cancel-preview', async (c) => {
    const response = await runPreviewRecurringCancellationHttp(
      c.env,
      trustedRecurringSalesActor(c),
      { ...objectBody(await c.req.json()), planId: c.req.param('id') },
    );
    return c.json(response.body, response.status as 200 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/admin/recurring-plans/:id/cancel', async (c) => {
    const response = await runCancelRecurringPlanHttp(c.env, trustedRecurringSalesActor(c), {
      ...objectBody(await c.req.json()),
      planId: c.req.param('id'),
    });
    return c.json(response.body, response.status as 200 | 403 | 404 | 409 | 422 | 500 | 503);
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
  app.post('/api/purchasing/invoices/match', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runMatchSupplierInvoiceHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.get('/api/owner/purchasing/three-way', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runOwnerThreeWayReportHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '');
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.post('/api/purchasing/returns', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateSupplierReturnHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/purchasing/returns/close', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCloseSupplierReturnHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/purchasing/returns/cancel', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCancelSupplierReturnHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.get('/api/owner/purchasing/returns', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runOwnerSupplierReturnsHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '');
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.post('/api/ledger/store-credit/issue', (c) => {
    const result = runIssueStoreCreditHttp(c.env);
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.post('/api/ledger/store-credit/expire', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runExpireStoreCreditHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/ledger/store-credit/adjust', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runAdjustStoreCreditHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.get('/api/owner/ledger/store-credit', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runOwnerStoreCreditHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '');
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.post('/api/sales/installments', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateInstallmentPlanHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/sales/installments/pay', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runPayInstallmentHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.get('/api/owner/installments/overdue', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runOwnerInstallmentsOverdueHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.role ?? '',
    );
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });

  app.get('/api/admin/commissions/rates', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runListCommissionRatesHttp(c.env, jwt?.tenantId ?? '', user?.role);
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.post('/api/admin/commissions/rates', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runUpsertCommissionRateHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/admin/commissions/payouts', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateCommissionPayoutHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/admin/commissions/payouts/pay', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runPayCommissionPayoutHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/admin/commissions/payouts/void', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runVoidCommissionPayoutHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.get('/api/owner/commissions', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runOwnerCommissionsHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '');
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });

  // Sprint 30 — promociones (FEATURE_PRICING_PROMOTIONS)
  app.get('/api/pricing/promotions', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListPromotionsHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 401 | 404 | 503);
  });
  app.post('/api/pricing/promotions', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreatePromotionHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });
  app.patch('/api/pricing/promotions/:id', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runUpdatePromotionHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      c.req.param('id'),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 401 | 404 | 422 | 503);
  });

  // Sprint 31 — catálogo padre/variantes + UOM racionales.
  // Sprint 50 — catalog.quick_add (default-off): alta/upsert por barcode y lector compartido.
  // Sprint C1 — catálogo vendible del POS (fe de errata: la ruta faltaba en index.ts).
  app.get('/api/catalog/sellable', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user') as { branchId?: string } | undefined;
    const result = await runListSellableCatalogHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.branchId ?? '',
    );
    return c.json(result.body, result.status as 200 | 401 | 404 | 503);
  });

  app.post('/api/catalog/quick-add', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runQuickAddHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 201 | 400 | 403 | 404 | 422 | 503);
  });
  app.get('/api/catalog/scan/:raw', async (c) => {
    const jwt = c.get('jwt');
    const result = await runScanLookupHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      c.req.param('raw') ?? '',
    );
    return c.json(result.body, result.status as 200 | 403 | 404 | 422 | 503);
  });
  // Sprint 51 — ops.shift_handoff + ops.team_invite (default-off).
  app.post('/api/cash/shifts/pin', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runIssueShiftPinHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });
  app.post('/api/cash/shifts/transfer', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runShiftTransferHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 409 | 422 | 503);
  });
  app.post('/api/team/invites', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runTeamInviteHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 201 | 400 | 403 | 404 | 409 | 422 | 503);
  });
  app.post('/api/team/resolve', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runResolveSellerHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 503);
  });
  // Sprint 52 — onboarding.tour (default-off): setup checklist + métrica GTM §6.2.
  app.get('/api/onboarding/setup-progress', async (c) => {
    const jwt = c.get('jwt');
    const result = await runSetupProgressHttp(c.env, {
      tenantId: jwt?.tenantId ?? '',
      userId: jwt?.sub ?? '',
      role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
    });
    return c.json(result.body, result.status as 200 | 404 | 503);
  });
  app.post('/api/growth/events', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runGrowthEventHttp(
      c.env,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 201 | 400 | 404 | 422 | 503);
  });
  app.get('/api/growth/events', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListGrowthEventsHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 401 | 503);
  });
  app.get('/api/catalog/variants-uom', async (c) => {
    const jwt = c.get('jwt');
    const result = await runListVariantsUomHttp(c.env, jwt?.tenantId ?? '');
    return c.json(result.body, result.status as 200 | 401 | 404 | 503);
  });
  app.patch('/api/catalog/variants/:id', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runUpdateVariantHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      c.req.param('id'),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/catalog/uoms', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runUpsertProductUomHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 422 | 503);
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

  // Sprint 38 — ubicaciones/racks (FEATURE_INVENTORY_LOCATIONS)
  app.get('/api/inventory/locations', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runListInventoryLocationsHttp(c.env, jwt?.tenantId ?? '', user?.role, {
      branchId: c.req.query('branchId') ?? '',
      includeInactive: c.req.query('includeInactive') === 'true',
    });
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 503);
  });
  app.post('/api/inventory/locations', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateInventoryLocationHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.patch('/api/inventory/locations', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runUpdateInventoryLocationHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.delete('/api/inventory/locations', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runDeactivateInventoryLocationHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.get('/api/inventory/locations/stock', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runInventoryLocationStockHttp(c.env, jwt?.tenantId ?? '', user?.role, {
      branchId: c.req.query('branchId') ?? '',
      locationId: c.req.query('locationId') ?? '',
      productId: c.req.query('productId') ?? '',
    });
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 503);
  });
  app.post('/api/inventory/locations/transfer', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runInventoryLocationTransferHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.get('/api/inventory/locations/picking', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runInventoryLocationPickingHttp(c.env, jwt?.tenantId ?? '', user?.role, {
      branchId: c.req.query('branchId') ?? '',
      productId: c.req.query('productId') ?? '',
      // US-01: texto crudo sin Number() — '0x10'/'1e3' se parsean tipado
      // fail-closed dentro de runInventoryLocationPickingHttp (400 estable).
      quantityMicrounits: c.req.query('quantityMicrounits'),
    });
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  // Sprint 39 — serial identity. Every route remains tenant-scoped by JWT middleware.
  app.patch('/api/inventory/serials/tracking', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runConfigureSerialTrackingHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.get('/api/inventory/serials', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const serialNumber = c.req.query('serialNumber');
    const productId = c.req.query('productId');
    const status = c.req.query('status');
    const result = await runSearchSerialsHttp(c.env, jwt?.tenantId ?? '', user?.role, {
      ...(serialNumber ? { serialNumber } : {}),
      ...(productId ? { productId } : {}),
      ...(status ? { status } : {}),
    });
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 503);
  });
  app.post('/api/inventory/serials/manifests', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCreateSerialManifestHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/inventory/serials/leases', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runAcquireSerialLeaseHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      c.req.header('x-terminal-id') ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  app.post('/api/inventory/serials/leases/release', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runReleaseSerialLeaseHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.role,
      c.req.header('x-terminal-id') ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/inventory/serials/disposition', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runDisposeSerialHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.userId ?? jwt?.sub ?? '',
      user?.role,
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });
  // Sprint 40 — weight policy, terminal-owned devices and normalized measurements.
  const scaleActor = (c: {
    get(name: 'jwt'): VerifiedJwtClaims | undefined;
    get(name: 'user'): UserSession | undefined;
    req: { header(name: string): string | undefined };
  }) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    return {
      tenantId: jwt?.tenantId ?? '',
      userId: user?.userId ?? jwt?.sub ?? '',
      role: user?.role ?? '',
      terminalId: c.req.header('x-terminal-id') ?? '',
      terminalSessionId: c.req.header('x-terminal-session-id') ?? '',
    };
  };
  app.get('/api/inventory/scale/devices', async (c) => {
    const result = await runListScaleDevicesHttp(c.env, scaleActor(c));
    return c.json(result.body, result.status as 200 | 403 | 404 | 500 | 503);
  });
  app.post('/api/inventory/scale/devices', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runRegisterScaleDeviceHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/inventory/scale/terminal-sessions', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runRegisterTerminalSessionHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 500 | 503);
  });
  app.post('/api/inventory/scale/devices/heartbeat', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runHeartbeatScaleDeviceHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/inventory/scale/diagnostics', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runDiagnoseScaleDeviceHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 403 | 404 | 500 | 503);
  });
  app.post('/api/inventory/scale/devices/disable', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runDisableScaleDeviceHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 403 | 404 | 500 | 503);
  });
  // Sprint 53 — Troubleshooter de hardware (regla 37b, ADR-0033).
  const hardwareDiagActor = (c: {
    get(name: 'jwt'): VerifiedJwtClaims | undefined;
    get(name: 'user'): UserSession | undefined;
  }): HardwareDiagActor => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    return {
      tenantId: jwt?.tenantId ?? '',
      userId: user?.userId ?? jwt?.sub ?? '',
      role: user?.role ?? '',
    };
  };
  app.post('/api/hardware/diagnostics', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runReportHardwareDiagnosticsHttp(c.env, hardwareDiagActor(c), body);
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 500 | 503);
  });
  app.get('/api/hardware/diagnostics', async (c) => {
    const limit = Number(c.req.query('limit') ?? '20');
    const result = await runListHardwareDiagnosticsHttp(c.env, hardwareDiagActor(c), limit);
    return c.json(result.body, result.status as 200 | 403 | 404 | 500 | 503);
  });
  app.put('/api/inventory/scale/policy', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runConfigureWeightPolicyHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/inventory/scale/authorize-manual', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runAuthorizeManualWeightHttp(
      c.env,
      scaleActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 500 | 503);
  });
  app.post('/api/inventory/scale/measurements', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runSubmitWeightHttp(c.env, scaleActor(c), body as Record<string, unknown>);
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 422 | 500 | 503);
  });
  // Sprint 41 — authoritative label snapshots. Transport/outbox remains POS-owned and OOS here.
  const priceLabelActor = (c: {
    get(name: 'jwt'): VerifiedJwtClaims | undefined;
    get(name: 'user'): UserSession | undefined;
    req: { header(name: string): string | undefined };
  }) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    return {
      tenantId: jwt?.tenantId ?? '',
      userId: user?.userId ?? jwt?.sub ?? '',
      role: (user?.role ?? '').toLowerCase(),
      branchId: user?.branchId ?? '',
      terminalId: c.req.header('x-terminal-id') ?? '',
      terminalSessionId: c.req.header('x-terminal-session-id') ?? '',
    };
  };
  app.get('/api/catalog/price-labels/templates', async (c) => {
    const result = await runListPriceLabelTemplatesHttp(
      c.env,
      priceLabelActor(c),
      c.req.query('includeRetired') === 'true',
    );
    return c.json(result.body, result.status as 200 | 403 | 404 | 500 | 503);
  });
  app.post('/api/catalog/price-labels/templates', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runUpsertPriceLabelTemplateHttp(
      c.env,
      priceLabelActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 409 | 422 | 500 | 503);
  });
  app.post('/api/catalog/price-labels/templates/retire', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runRetirePriceLabelTemplateHttp(
      c.env,
      priceLabelActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 500 | 503);
  });
  app.post('/api/catalog/price-labels/batches', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runCreatePriceLabelBatchHttp(
      c.env,
      priceLabelActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/catalog/price-labels/batches/reprint', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runReprintPriceLabelBatchHttp(
      c.env,
      priceLabelActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 201 | 400 | 403 | 404 | 422 | 500 | 503);
  });
  app.post('/api/catalog/price-labels/batches/ack', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runAcknowledgePriceLabelItemsHttp(
      c.env,
      priceLabelActor(c),
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 500 | 503);
  });
  app.post('/api/inventory/counts/submit-review', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const user = c.get('user');
    const result = await runSubmitCountReviewHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.role ?? '',
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
      user?.role ?? '',
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
      user?.role ?? '',
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
  // Sprint 45 — authenticated Zero-Trust mobile push. Identity/scope are never body-derived.
  app.post('/api/push/consents', async (c) =>
    pushResponse(await grantPushConsentHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.delete('/api/push/consents', async (c) =>
    pushResponse(await revokePushConsentHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.post('/api/push/subscriptions', async (c) =>
    pushResponse(await subscribePushDeviceHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.put('/api/push/subscriptions/rotate', async (c) =>
    pushResponse(await rotatePushDeviceHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.delete('/api/push/subscriptions', async (c) =>
    pushResponse(await revokePushDeviceHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.get('/api/push/devices', async (c) =>
    pushResponse(await listPushDevicesHttp(c.env, trustedPushActor(c))),
  );
  app.patch('/api/push/privacy', async (c) =>
    pushResponse(await updatePushPrivacyHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.get('/api/push/privacy', async (c) =>
    pushResponse(await getPushPrivacyPolicyHttp(c.env, trustedPushActor(c))),
  );
  app.put('/api/push/privacy-policy', async (c) =>
    pushResponse(await updatePushPrivacyPolicyHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.post('/api/push/test', async (c) =>
    pushResponse(await sendTestPushHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  app.post('/api/push/ack', async (c) =>
    pushResponse(await acknowledgeDisplayedHttp(c.env, trustedPushActor(c), await c.req.json())),
  );
  // Compatibility paths map to the same engine and purpose, never a second transport.
  app.post('/api/owner/push/subscribe', async (c) =>
    pushResponse(
      await subscribePushDeviceHttp(c.env, trustedPushActor(c), {
        ...objectBody(await c.req.json()),
        purpose: 'OWNER_ALERTS',
      }),
    ),
  );
  app.post('/api/owner/push/send', async (c) =>
    pushResponse(
      await sendTestPushHttp(c.env, trustedPushActor(c), {
        ...objectBody(await c.req.json()),
        purpose: 'OWNER_ALERTS',
      }),
    ),
  );

  // Reporting rollups / catálogo / CSV (Sprint 9) — flags default off
  const reportQueryOpts = (c: {
    req: { query: (k: string) => string | undefined };
    get: (k: string) => unknown;
  }): { reportDate: string; format?: string; branchId?: string; role?: string } => {
    const opts: { reportDate: string; format?: string; branchId?: string; role?: string } = {
      reportDate: c.req.query('date') ?? '',
    };
    const format = c.req.query('format');
    if (format) opts.format = format;
    const branchId = c.req.query('branchId');
    if (branchId) opts.branchId = branchId;
    const user = c.get('user') as { role?: string } | undefined;
    if (user?.role) opts.role = user.role;
    return opts;
  };
  app.get('/api/reports/catalog', (c) => {
    const result = runReportsCatalogHttp(c.env);
    return c.json(result.body, result.status as 200 | 404);
  });
  // S11-E10: export del catálogo en CSV (Guía Legal Q4 — el cliente exporta
  // todo su catálogo y sus ventas; las ventas ya están en /api/reports/*).
  app.get('/api/catalog/export', async (c) => {
    const jwt = c.get('jwt') as { tenantId?: string } | undefined;
    const result = await runExportCatalogCsvHttp(c.env, jwt?.tenantId ?? '');
    if (typeof result.body === 'string') {
      return c.body(result.body, result.status as 200, {
        'content-type': result.contentType ?? 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="catalogo.csv"',
      });
    }
    return c.json(result.body, result.status as 503);
  });
  app.get('/api/sales/export', async (c) => {
    const jwt = c.get('jwt') as { tenantId?: string } | undefined;
    const result = await runExportSalesCsvHttp(c.env, jwt?.tenantId ?? '', {
      fromDate: c.req.query('from') ?? '',
      toDate: c.req.query('to') ?? '',
    });
    if (typeof result.body === 'string') {
      return c.body(result.body, result.status as 200, {
        'content-type': result.contentType ?? 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="ventas.csv"',
      });
    }
    return c.json(result.body, result.status as 503);
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
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 500 | 503);
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
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 500 | 503);
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
    return c.json(result.body, result.status as 200 | 201 | 400 | 404 | 422 | 503);
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
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runCatalogImportHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
      user?.role ?? '',
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });

  // Sprint 23 — Contador + API keys/webhooks (Cadena+)
  app.post('/api/integrations/accounting/export', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runAccountingExportHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
      user?.userId ?? '',
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

  // Sprint 24 — loyalty + WhatsApp opt-in (Cadena+)
  app.post('/api/loyalty/reserve', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const body: unknown = await c.req.json();
    const result = await runLoyaltyReserveHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
      user?.role ?? '',
    );
    return c.json(result.body, result.status as 200 | 201 | 400 | 403 | 404 | 422 | 503);
  });
  app.get('/api/loyalty/balance', async (c) => {
    const jwt = c.get('jwt');
    const customerId = c.req.query('customerId') ?? '';
    const result = await runLoyaltyBalanceHttp(c.env, jwt?.tenantId ?? '', customerId);
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 503);
  });
  app.post('/api/messaging/opt-in', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runMessagingOptInHttp(
      c.env,
      jwt?.tenantId ?? '',
      body as Record<string, unknown>,
    );
    return c.json(result.body, result.status as 200 | 201 | 400 | 403 | 404 | 503);
  });
  app.post('/api/loyalty/cron/expire', async (c) => {
    const result = await runExpireLoyaltyCronHttp(c.env);
    return c.json(result.body, result.status as 200 | 404 | 422 | 503);
  });

  // Sprint 46 — analítica predictiva (Cadena+; 402 Plan Guard vía /api/forecasting/)
  app.get('/api/forecasting/alerts/:branchId', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runStockAlertsHttp(
      c.env,
      jwt?.tenantId ?? '',
      c.req.param('branchId'),
      c.req.query(),
      user?.role ?? '',
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 503);
  });
  app.get('/api/forecasting/:branchId', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runListForecastsHttp(
      c.env,
      jwt?.tenantId ?? '',
      c.req.param('branchId'),
      user?.role ?? '',
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 503);
  });
  app.post('/api/forecasting/refresh/:branchId', async (c) => {
    const jwt = c.get('jwt');
    const user = c.get('user');
    const result = await runRefreshForecastHttp(
      c.env,
      jwt?.tenantId ?? '',
      c.req.param('branchId'),
      user?.role ?? '',
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 503);
  });

  // Sprint 47 — LPDP (FEATURE_LPDP, default-off; ADR-0031).
  app.get('/api/customers', async (c) => {
    const result = await runListCustomersHttp(
      c.env,
      trustedLpdpActor(c),
      c.req.query('limit'),
      c.req.query('offset'),
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.get('/api/customers/:id/consents', async (c) => {
    const result = await runListConsentsHttp(c.env, trustedLpdpActor(c), c.req.param('id'));
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.post('/api/customers/:id/consent', async (c) => {
    const body: unknown = await c.req.json();
    const result = await runWriteConsentHttp(
      c.env,
      trustedLpdpActor(c),
      c.req.param('id'),
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.get('/api/customers/:id/export', async (c) => {
    const result = await runExportCustomerHttp(c.env, trustedLpdpActor(c), c.req.param('id'));
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });
  app.post('/api/customers/:id/erase', async (c) => {
    const result = await runEraseCustomerHttp(c.env, trustedLpdpActor(c), c.req.param('id'));
    return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 422 | 503);
  });

  // Sprint 27 — sobregiro Stripe Metered (fuera del hot path)
  app.post('/api/billing/cron/meter-overage', async (c) => {
    const user = c.get('user');
    const result = await runMeterOverageCronHttp(c.env, undefined, user?.role ?? '');
    return c.json(result.body, result.status as 200 | 403 | 404 | 502 | 503);
  });

  // Sprint 42 — KPBK1 export + restore dry-run (data.backup, default-off).
  app.post('/api/backups', async (c) => {
    const body: unknown = await c.req.json();
    return backupResponse(
      await runCreateBackupHttp(
        c.env,
        trustedBackupActor(c.get('user'), c.get('jwt')),
        body && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {},
      ),
    );
  });
  // S42-H1: emite el step-up token one-shot (owner; consume vía x-step-up-token).
  app.post('/api/backups/step-up-token', async (c) =>
    backupResponse(
      await runMintBackupStepUpTokenHttp(
        c.env,
        trustedBackupActor(c.get('user'), c.get('jwt')),
        (await c.req.json().catch(() => null)) as Record<string, unknown>,
      ),
    ),
  );
  app.get('/api/backups', async (c) =>
    backupResponse(
      await runListBackupsHttp(c.env, trustedBackupActor(c.get('user'), c.get('jwt'))),
    ),
  );
  app.get('/api/backups/:id', async (c) =>
    backupResponse(
      await runBackupStatusHttp(c.env, trustedBackupActor(c.get('user'), c.get('jwt')), {
        backupId: c.req.param('id'),
      }),
    ),
  );
  app.get('/api/backups/:id/download', async (c) =>
    backupResponse(
      await runDownloadBackupHttp(c.env, trustedBackupActor(c.get('user'), c.get('jwt')), {
        backupId: c.req.param('id'),
        ...(c.req.header('x-step-up-token')
          ? { stepUpToken: c.req.header('x-step-up-token')! }
          : {}),
      }),
    ),
  );
  app.post('/api/backups/:id/restore-dry-run', async (c) => {
    const body: { idempotencyKey?: string } = await c.req.json();
    return backupResponse(
      await runRestoreDryRunHttp(
        c.env,
        trustedBackupActor(c.get('user'), c.get('jwt')),
        {
          backupId: c.req.param('id'),
          idempotencyKey: body.idempotencyKey ?? '',
          ...(c.req.header('x-step-up-token')
            ? { stepUpToken: c.req.header('x-step-up-token')! }
            : {}),
        },
        (task) => c.executionCtx.waitUntil(task),
      ),
    );
  });

  // Sprint 48 — platform.dr: simulacro DR anual (owner + step-up, default-off).
  app.post('/api/dr/simulation', async (c) => {
    const body: { backupId?: string } = await c.req.json();
    const result = await runDrSimulationHttp(
      c.env,
      trustedBackupActor(c.get('user'), c.get('jwt')),
      {
        ...(typeof body.backupId === 'string' && body.backupId ? { backupId: body.backupId } : {}),
        ...(c.req.header('x-step-up-token')
          ? { stepUpToken: c.req.header('x-step-up-token')! }
          : {}),
      },
    );
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 422 | 503);
  });

  // Sprint 49 — insights (analytics.agentic_insights, Cadena+, default-off).
  app.post('/api/insights/chat', async (c) => {
    const jwt = c.get('jwt');
    const body: unknown = await c.req.json();
    const result = await runInsightChatHttp(
      c.env as unknown as InsightsEnv,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {},
    );
    if (result instanceof Response) return result;
    return c.json(result.body, result.status as 400 | 402 | 403 | 404 | 422 | 503);
  });
  app.get('/api/insights/briefing', async (c) => {
    const jwt = c.get('jwt');
    const result = await runBriefingHttp(
      c.env as unknown as InsightsEnv,
      {
        tenantId: jwt?.tenantId ?? '',
        userId: jwt?.sub ?? '',
        role: (c.get('user') as { role?: string } | undefined)?.role ?? '',
      },
      c.req.query('date') ?? null,
    );
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
    const { decision } = await enforceRateLimit({
      kv: c.env?.TENANT_KV,
      key: rateLimitKey(clientIp(c.req.raw), 'bootstrap'),
      limit: 10,
      windowSeconds: 3600,
    });
    if (!decision.allowed) {
      return c.json({ error: 'Too many attempts', code: 'RATE_LIMITED' }, 429);
    }
    const result = await runBootstrapHttp(c.env, raw);
    if (result.status === 201 && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      if (typeof o.ref === 'string' && o.ref && typeof result.body.tenantId === 'string') {
        void runCaptureReferralHttp(c.env, {
          referredTenantId: result.body.tenantId,
          ref: o.ref,
        });
      }
    }
    return c.json(result.body, result.status as 201 | 400 | 422);
  });

  app.post('/v1/reclamaciones', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const { decision } = await enforceRateLimit({
      kv: c.env?.TENANT_KV,
      key: rateLimitKey(clientIp(c.req.raw), 'reclamaciones'),
      limit: 10,
      windowSeconds: 3600,
    });
    if (!decision.allowed) {
      return c.json({ error: 'Too many attempts', code: 'RATE_LIMITED' }, 429);
    }
    const result = await runCreateReclamacionHttp(c.env, raw);
    return c.json(result.body, result.status as 201 | 422 | 503);
  });
  app.get('/v1/internal/reclamaciones', async (c) => {
    const result = await runListReclamacionesHttp(
      c.env,
      c.req.header('x-platform-staff-token') ?? undefined,
    );
    return c.json(result.body, result.status as 200 | 401 | 503);
  });
  app.patch('/v1/internal/reclamaciones', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = await runRespondReclamacionHttp(
      c.env,
      c.req.header('x-platform-staff-token') ?? undefined,
      raw,
    );
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 422 | 503);
  });

  app.patch('/api/tenant/formalization', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const jwt = c.get('jwt') as { tenantId: string; sub?: string } | undefined;
    const user = c.get('user') as { userId?: string } | undefined;
    const role = (user as { role?: string } | undefined)?.role ?? '';
    const result = await runFormalizationStageHttp(
      c.env,
      jwt?.tenantId ?? '',
      raw,
      user?.userId ?? jwt?.sub ?? 'system',
      role,
    );
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
  });

  // S11-B5: cambio de plan self-serve (GTM §8) — owner/admin.
  app.patch('/api/tenant/plan', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const jwt = c.get('jwt') as { tenantId?: string } | undefined;
    const user = c.get('user') as { role?: string } | undefined;
    const result = await runUpdatePlanHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '', raw);
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 503);
  });

  // S11-E11: cancelación self-serve (Guía Legal Parte V) — owner/admin.
  app.post('/api/tenant/cancel', async (c) => {
    const jwt = c.get('jwt') as { tenantId?: string } | undefined;
    const user = c.get('user') as { role?: string } | undefined;
    const result = await runCancelTenantHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '');
    return c.json(result.body, result.status as 200 | 401 | 403 | 404 | 503);
  });
  app.post('/api/tenant/billing-portal', async (c) => {
    const jwt = c.get('jwt') as { tenantId?: string } | undefined;
    const user = c.get('user') as { role?: string } | undefined;
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = {};
    }
    const returnUrl =
      raw &&
      typeof raw === 'object' &&
      typeof (raw as { returnUrl?: unknown }).returnUrl === 'string'
        ? (raw as { returnUrl: string }).returnUrl
        : 'https://app.kipuspay.com/admin/configuracion';
    const result = await runBillingPortalHttp(
      c.env,
      jwt?.tenantId ?? '',
      user?.role ?? '',
      returnUrl,
    );
    return c.json(result.body, result.status as 200 | 401 | 403 | 422 | 502 | 503);
  });
  app.post('/api/tenant/checkout-session', async (c) => {
    const jwt = c.get('jwt') as { tenantId?: string } | undefined;
    const user = c.get('user') as { role?: string } | undefined;
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = {};
    }
    const result = await runCheckoutSessionHttp(c.env, jwt?.tenantId ?? '', user?.role ?? '', raw);
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 422 | 502 | 503);
  });

  // Sprint 12 — referidos (soft-launch in-memory; DDL 0010 = contrato D1)
  app.post('/v1/referrals/code', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = await runEnsureReferralCodeHttp(c.env, raw);
    return c.json(result.body, result.status as 200 | 400 | 422);
  });

  app.post('/v1/referrals/capture', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const { decision } = await enforceRateLimit({
      kv: c.env?.TENANT_KV,
      key: rateLimitKey(clientIp(c.req.raw), 'referral-capture'),
      limit: 50,
      windowSeconds: 3600,
    });
    if (!decision.allowed) {
      return c.json({ error: 'Too many attempts', code: 'RATE_LIMITED' }, 429);
    }
    const result = await runCaptureReferralHttp(c.env, raw);
    return c.json(result.body, result.status as 201 | 400 | 422);
  });

  app.post('/v1/referrals/first-sale', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = await runFirstSaleReferralHttp(c.env, raw);
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
      return c.json({ error: 'INVALID_WEBHOOK_TIMESTAMP', code: 'INVALID_WEBHOOK_TIMESTAMP' }, 400);
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
    return c.json(result.body, result.status as 200 | 400 | 401 | 413 | 503);
  });

  app.onError((_error, c) => c.json({ code: 'INTERNAL_ERROR' }, 500));
  return app;
}

/** App con deps fail-closed (tests / sin bindings). El deploy usa `worker.ts`. */
const app = createApp();
export default app;
