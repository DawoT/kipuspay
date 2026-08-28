/** Feature flags cliente (PUBLIC_*). Default off. SvelteKit: $env/dynamic/public. Ola 2: migración progresiva a capabilitiesStore. */
import { env } from '$env/dynamic/public';
import { has as hasCap } from './tenant/capabilitiesStore.js';

function flagOn(value: string | boolean | undefined): boolean {
  return value === '1' || value === 'true' || value === true;
}

function pub(name: string): string | undefined {
  return (env as Record<string, string | undefined>)[name];
}

const PF = 'PUBLIC_FEATURE_';

function isDynamic(): boolean {
  const v =
    (env as Record<string, string | undefined>)['PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC'] ??
    (env as Record<string, string | undefined>)['FEATURE_TENANT_CAPABILITIES_DYNAMIC'];
  return v === '1' || v === 'true';
}

function capOrFlag(cap: string, flagSuffix: string): boolean {
  if (isDynamic()) return hasCap(cap);
  return flagOn(pub(PF + flagSuffix));
}

/** @deprecated Ola 2 — delega a capabilitiesStore.has('pos.checkout') si dynamic 1, sino PUBLIC_FEATURE_POS_CHECKOUT */
export function isPosCheckoutEnabled(): boolean {
  return capOrFlag('pos.checkout', 'POS_CHECKOUT');
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isPrintTemplatesEnabled(): boolean {
  return capOrFlag('hardware.print_templates', 'PRINT_TEMPLATES');
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isVitrinaEnabled(): boolean {
  return capOrFlag('display.vitrina', 'VITRINA');
}

/** @deprecated Ola 2 — delega a capabilitiesStore.has('owner.mode') */
export function isOwnerModeEnabled(): boolean {
  return capOrFlag('owner.mode', 'OWNER_MODE');
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isOwnerPushEnabled(): boolean {
  return capOrFlag('owner.push_alerts', 'OWNER_PUSH');
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isLedgerArApEnabled(): boolean {
  if (isDynamic()) return hasCap('ledger.accounts_receivable') || hasCap('ledger.accounts_payable');
  return flagOn(pub(PF + 'LEDGER_AR_AP'));
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isCashExpensesEnabled(): boolean {
  return capOrFlag('cash.register_expenses', 'CASH_EXPENSES');
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isPurchasingOrdersEnabled(): boolean {
  return capOrFlag('purchasing.orders', 'PURCHASING_ORDERS');
}

/** @deprecated Ola 2 — fallback a flag (capability fiscal no canonica) */
export function isFiscalRcEnabled(): boolean {
  return flagOn(pub(PF + 'FISCAL_RC'));
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isReportingCatalogEnabled(): boolean {
  return capOrFlag('reporting.catalog', 'REPORTING_CATALOG');
}

/** @deprecated Ola 2 — delega a capabilitiesStore */
export function isReportingExportEnabled(): boolean {
  return capOrFlag('reporting.export', 'REPORTING_EXPORT');
}

/** Sprint 17 — cierre Z ciego / movimientos / reprints. @deprecated Ola 2 */
export function isCashBlindZEnabled(): boolean {
  return capOrFlag('cash.blind_z', 'CASH_BLIND_Z');
}

/** Sprint 18 — FEFO / BOM / conteo / merma / alertas. @deprecated Ola 2 */
export function isInventoryOpsEnabled(): boolean {
  if (isDynamic()) return hasCap('inventory.batches') || hasCap('inventory.bom');
  return flagOn(pub(PF + 'INVENTORY_BATCHES')) || flagOn(pub(PF + 'INVENTORY_BOM'));
}

/** Sprint 40 — balanza y venta por peso variable. @deprecated Ola 2 */
export function isInventoryScaleEnabled(): boolean {
  return capOrFlag('inventory.scale', 'INVENTORY_SCALE');
}

/** Sprint 19 — comandas / KDS / split. @deprecated Ola 2 */
export function isOrdersKdsEnabled(): boolean {
  return capOrFlag('orders.kds', 'ORDERS_KDS');
}

/** Sprint 20 — transferencias entre sucursales. @deprecated Ola 2 */
export function isStockTransfersEnabled(): boolean {
  return capOrFlag('stock.transfers', 'STOCK_TRANSFERS');
}

/** Sprint 20 — recepción parcial OC. @deprecated Ola 2 */
export function isPartialReceiveEnabled(): boolean {
  return capOrFlag('purchasing.partial_receive', 'PURCHASING_PARTIAL_RECEIVE');
}

/** Sprint 29 — matching 3-way OC/recepción/factura. @deprecated Ola 2 */
export function isPurchasingThreeWayEnabled(): boolean {
  return capOrFlag('purchasing.three_way', 'PURCHASING_THREE_WAY');
}

/** Sprint 22 — wallets QR en caja. @deprecated Ola 2 */
export function isPaymentsQrWalletsEnabled(): boolean {
  return capOrFlag('payments.qr_wallets', 'PAYMENTS_QR_WALLETS');
}

/** Sprint 22 — tarjeta Culqi/Niubiz en caja. @deprecated Ola 2 */
export function isPaymentsCardAcquirerEnabled(): boolean {
  return capOrFlag('payments.card_acquirer', 'PAYMENTS_CARD_ACQUIRER');
}

/** Sprint 23 — export Contasis/Concar. @deprecated Ola 2 */
export function isAccountingExportEnabled(): boolean {
  return capOrFlag('integrations.accounting_export', 'ACCOUNTING_EXPORT');
}

/** Sprint 23 — API keys + webhooks. @deprecated Ola 2 */
export function isIntegrationsApiEnabled(): boolean {
  return capOrFlag('integrations.api', 'INTEGRATIONS_API');
}

/** Sprint 21 — importación de catálogo Bsale/Alegra/CSV; siempre default-off. @deprecated Ola 2 */
export function isCatalogImportEnabled(): boolean {
  return capOrFlag('integrations.catalog_import', 'CATALOG_IMPORT');
}

/** Sprint 24 — WhatsApp receipt. @deprecated Ola 2 */
export function isMessagingWhatsAppEnabled(): boolean {
  return capOrFlag('messaging.whatsapp_receipt', 'MESSAGING_WHATSAPP');
}

/** Sprint 24 — loyalty points. @deprecated Ola 2 */
export function isLoyaltyPointsEnabled(): boolean {
  return capOrFlag('loyalty.points', 'LOYALTY_POINTS');
}

/** Sprint 25 — client offloading (Web Worker ESC/POS). */
export function isClientOffloadingEnabled(): boolean {
  return flagOn(pub(PF + 'CLIENT_OFFLOADING'));
}

/** Sprint 25 — print fallback ladder. */
export function isHardwarePrintFallbackEnabled(): boolean {
  return flagOn(pub(PF + 'HARDWARE_PRINT_FALLBACK'));
}

/** Sprint 26 — circuit breaker / backlog Dueño E-A. */
export function isFiscalCircuitBreakerEnabled(): boolean {
  return flagOn(pub(PF + 'FISCAL_CIRCUIT_BREAKER'));
}

/** Sprint 26 — transport plugins OSE/PSE tercero. */
export function isFiscalTransportPluginsEnabled(): boolean {
  return flagOn(pub(PF + 'FISCAL_TRANSPORT_PLUGINS'));
}

/** Sprint 28 — devoluciones con política N días. @deprecated Ola 2 */
export function isSalesReturnsEnabled(): boolean {
  return capOrFlag('sales.returns', 'SALES_RETURNS');
}

/** Sprint 30 — promociones y tramos. @deprecated Ola 2 */
export function isPricingPromotionsEnabled(): boolean {
  return capOrFlag('pricing.promotions', 'PRICING_PROMOTIONS');
}

/** Sprint 31 — catálogo padre/variantes. @deprecated Ola 2 */
export function isCatalogVariantsEnabled(): boolean {
  return capOrFlag('catalog.variants', 'CATALOG_VARIANTS');
}

/** Sprint 31 — unidades de medida racionales. @deprecated Ola 2 */
export function isCatalogUomEnabled(): boolean {
  return capOrFlag('catalog.uom', 'CATALOG_UOM');
}

/** Sprint 32 — apartados / anticipos. @deprecated Ola 2 */
export function isSalesLayawayEnabled(): boolean {
  return capOrFlag('sales.layaway', 'SALES_LAYAWAY');
}

/** Sprint 32 — diario contable solo lectura. @deprecated Ola 2 */
export function isLedgerChartOfAccountsEnabled(): boolean {
  return capOrFlag('ledger.chart_of_accounts', 'LEDGER_CHART_OF_ACCOUNTS');
}

/** Sprint 33 — cotizaciones / presupuestos. @deprecated Ola 2 */
export function isSalesQuotesEnabled(): boolean {
  return capOrFlag('sales.quotes', 'SALES_QUOTES');
}

/** Sprint 34 — devolución a proveedor. @deprecated Ola 2 */
export function isPurchasingReturnsEnabled(): boolean {
  return capOrFlag('purchasing.returns', 'PURCHASING_RETURNS');
}

/** Sprint 35 — crédito de tienda / gift cards. @deprecated Ola 2 */
export function isLedgerStoreCreditEnabled(): boolean {
  return capOrFlag('ledger.store_credit', 'LEDGER_STORE_CREDIT');
}

/** Sprint 36 — cuotas / pago en partes. @deprecated Ola 2 */
export function isSalesInstallmentsEnabled(): boolean {
  return capOrFlag('sales.installments', 'SALES_INSTALLMENTS');
}

/** Sprint 37 — comisiones de vendedor. @deprecated Ola 2 */
export function isSalesCommissionsEnabled(): boolean {
  return capOrFlag('sales.commissions', 'SALES_COMMISSIONS');
}

/** Sprint 38 — ubicaciones y racks. @deprecated Ola 2 */
export function isInventoryLocationsEnabled(): boolean {
  return capOrFlag('inventory.locations', 'INVENTORY_LOCATIONS');
}

/** Sprint 39 — serial identity and terminal leases. @deprecated Ola 2 */
export function isInventorySerialsEnabled(): boolean {
  return capOrFlag('inventory.serials', 'INVENTORY_SERIALS');
}

/** Sprint 41 — etiquetas de precio confiables desde snapshot servidor. @deprecated Ola 2 */
export function isCatalogPriceLabelsEnabled(): boolean {
  return capOrFlag('catalog.price_labels', 'CATALOG_PRICE_LABELS');
}

/** Sprint 43 — pedidos de cliente con retiro; siempre apagado si falta PUBLIC_*. @deprecated Ola 2 */
export function isCustomerOrdersEnabled(): boolean {
  return capOrFlag('orders.customer_orders', 'ORDERS_CUSTOMER_ORDERS');
}

/** Sprint 44 — membresías; siempre apagado si falta PUBLIC_*. @deprecated Ola 2 */
export function isRecurringSalesEnabled(): boolean {
  return capOrFlag('sales.recurring', 'SALES_RECURRING');
}

/** Sprint 45 — motor push operacional; siempre default-off. @deprecated Ola 2 */
export function isMobilePushEnabled(): boolean {
  return capOrFlag('mobile.push', 'MOBILE_PUSH');
}

/** Sprint 45 — instalación Android del POS único; siempre default-off. @deprecated Ola 2 */
export function isMobilePosEnabled(): boolean {
  return capOrFlag('client.mobile_pos', 'CLIENT_MOBILE_POS');
}

/** Sprint 47 — LPDP (datos personales); siempre default-off. @deprecated Ola 2 */
export function isLpdpEnabled(): boolean {
  return capOrFlag('compliance.lpdp', 'LPDP');
}

/** Sprint 49 — inteligencia del negocio (asistente + briefing); siempre default-off. @deprecated Ola 2 */
export function isAgenticInsightsEnabled(): boolean {
  return capOrFlag('analytics.agentic_insights', 'ANALYTICS_AGENTIC_INSIGHTS');
}

/** Sprint 50 — alta rápida de catálogo (escáner); siempre default-off. @deprecated Ola 2 */
export function isCatalogQuickAddEnabled(): boolean {
  return capOrFlag('catalog.quick_add', 'CATALOG_QUICK_ADD');
}

/** Sprint 51 — handoff de turno; siempre default-off. @deprecated Ola 2 */
export function isShiftHandoffEnabled(): boolean {
  return capOrFlag('ops.shift_handoff', 'SHIFT_HANDOFF');
}

/** Sprint 51 — equipo e invitaciones; siempre default-off. @deprecated Ola 2 */
export function isTeamInviteEnabled(): boolean {
  return capOrFlag('ops.team_invite', 'TEAM_INVITE');
}

/** Sprint 52 — Product Tour + setup checklist; siempre default-off. @deprecated Ola 2 */
export function isOnboardingTourEnabled(): boolean {
  return capOrFlag('onboarding.tour', 'ONBOARDING_TOUR');
}

/** Backlog v10 P1a — Nota de Débito; siempre default-off. */
export function isDebitNoteEnabled(): boolean {
  return flagOn(pub(PF + 'SALES_DEBIT_NOTE'));
}

/** Backlog v10 P2 — propinas en el cobro; siempre default-off. */
export function isSaleTipEnabled(): boolean {
  return flagOn(pub(PF + 'SALE_TIP'));
}

/** Backlog v10 P2 — cajón de efectivo; siempre default-off. */
export function isCashDrawerEnabled(): boolean {
  return flagOn(pub(PF + 'CASH_DRAWER'));
}

/** GTM §6.5 — feedback sonoro/háptico al completar venta; default-off. */
export function isSaleFeedbackEnabled(): boolean {
  return flagOn(pub(PF + 'SALE_FEEDBACK'));
}

/** Backlog v10 P1c — Percepciones/Retenciones; siempre default-off. */
export function isWithholdingsEnabled(): boolean {
  return flagOn(pub(PF + 'FISCAL_WITHHOLDINGS'));
}

/** Backlog v10 P1b — Guía de Remisión Electrónica; siempre default-off. */
export function isGreEnabled(): boolean {
  return flagOn(pub(PF + 'GRE'));
}

/** Sprint 53 — Troubleshooter de hardware (ADR-0033); siempre default-off. @deprecated Ola 2 */
export function isHardwareDiagnosticsEnabled(): boolean {
  return capOrFlag('hardware.diagnostics', 'HARDWARE_DIAGNOSTICS');
}

/** Sprint 46 — analítica predictiva (ADR-0030); siempre default-off. @deprecated Ola 2 */
export function isAnalyticsForecastingEnabled(): boolean {
  return capOrFlag('analytics.forecasting', 'ANALYTICS_FORECASTING');
}

/** Sprint C1 — catálogo vendible en la terminal (grid + buscador); siempre default-off. @deprecated Ola 2 */
export function isCatalogSellableEnabled(): boolean {
  return capOrFlag('catalog.sellable', 'CATALOG_SELLABLE');
}

/** Sprint 42 — respaldos D1 y DR; siempre default-off. @deprecated Ola 2 */
export function isDataBackupEnabled(): boolean {
  return capOrFlag('data.backup', 'DATA_BACKUP');
}

/** Grifos — Surtidores e isla de despacho (precio del día + detracción diésel); default-off. */
export function isFuelStationEnabled(): boolean {
  return flagOn(pub(PF + 'FUEL_STATION'));
}
