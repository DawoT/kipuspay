/** Feature flags cliente (PUBLIC_*). Default off. SvelteKit: $env/dynamic/public. */
import { env } from '$env/dynamic/public';

function flagOn(value: string | boolean | undefined): boolean {
  return value === '1' || value === 'true' || value === true;
}

function pub(name: string): string | undefined {
  return (env as Record<string, string | undefined>)[name];
}

const PF = 'PUBLIC_FEATURE_';

export function isPosCheckoutEnabled(): boolean {
  return flagOn(pub(PF + 'POS_CHECKOUT'));
}

export function isPrintTemplatesEnabled(): boolean {
  return flagOn(pub(PF + 'PRINT_TEMPLATES'));
}

export function isVitrinaEnabled(): boolean {
  return flagOn(pub(PF + 'VITRINA'));
}

export function isOwnerModeEnabled(): boolean {
  return flagOn(pub(PF + 'OWNER_MODE'));
}

export function isOwnerPushEnabled(): boolean {
  return flagOn(pub(PF + 'OWNER_PUSH'));
}

export function isLedgerArApEnabled(): boolean {
  return flagOn(pub(PF + 'LEDGER_AR_AP'));
}

export function isReportingCatalogEnabled(): boolean {
  return flagOn(pub(PF + 'REPORTING_CATALOG'));
}

export function isReportingExportEnabled(): boolean {
  return flagOn(pub(PF + 'REPORTING_EXPORT'));
}

/** Sprint 17 — cierre Z ciego / movimientos / reprints. */
export function isCashBlindZEnabled(): boolean {
  return flagOn(pub(PF + 'CASH_BLIND_Z'));
}

/** Sprint 18 — FEFO / BOM / conteo / merma / alertas. */
export function isInventoryOpsEnabled(): boolean {
  return flagOn(pub(PF + 'INVENTORY_BATCHES')) || flagOn(pub(PF + 'INVENTORY_BOM'));
}

/** Sprint 19 — comandas / KDS / split. */
export function isOrdersKdsEnabled(): boolean {
  return flagOn(pub(PF + 'ORDERS_KDS'));
}

/** Sprint 20 — transferencias entre sucursales. */
export function isStockTransfersEnabled(): boolean {
  return flagOn(pub(PF + 'STOCK_TRANSFERS'));
}

/** Sprint 20 — recepción parcial OC. */
export function isPartialReceiveEnabled(): boolean {
  return flagOn(pub(PF + 'PURCHASING_PARTIAL_RECEIVE'));
}

/** Sprint 29 — matching 3-way OC/recepción/factura. */
export function isPurchasingThreeWayEnabled(): boolean {
  return flagOn(pub(PF + 'PURCHASING_THREE_WAY'));
}

/** Sprint 22 — wallets QR en caja. */
export function isPaymentsQrWalletsEnabled(): boolean {
  return flagOn(pub(PF + 'PAYMENTS_QR_WALLETS'));
}

/** Sprint 22 — tarjeta Culqi/Niubiz en caja. */
export function isPaymentsCardAcquirerEnabled(): boolean {
  return flagOn(pub(PF + 'PAYMENTS_CARD_ACQUIRER'));
}

/** Sprint 23 — export Contasis/Concar. */
export function isAccountingExportEnabled(): boolean {
  return flagOn(pub(PF + 'ACCOUNTING_EXPORT'));
}

/** Sprint 23 — API keys + webhooks. */
export function isIntegrationsApiEnabled(): boolean {
  return flagOn(pub(PF + 'INTEGRATIONS_API'));
}

/** Sprint 24 — WhatsApp receipt. */
export function isMessagingWhatsAppEnabled(): boolean {
  return flagOn(pub(PF + 'MESSAGING_WHATSAPP'));
}

/** Sprint 24 — loyalty points. */
export function isLoyaltyPointsEnabled(): boolean {
  return flagOn(pub(PF + 'LOYALTY_POINTS'));
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

/** Sprint 28 — devoluciones con política N días. */
export function isSalesReturnsEnabled(): boolean {
  return flagOn(pub(PF + 'SALES_RETURNS'));
}

/** Sprint 30 — promociones y tramos. */
export function isPricingPromotionsEnabled(): boolean {
  return flagOn(pub(PF + 'PRICING_PROMOTIONS'));
}

/** Sprint 31 — catálogo padre/variantes. */
export function isCatalogVariantsEnabled(): boolean {
  return flagOn(pub(PF + 'CATALOG_VARIANTS'));
}

/** Sprint 31 — unidades de medida racionales. */
export function isCatalogUomEnabled(): boolean {
  return flagOn(pub(PF + 'CATALOG_UOM'));
}

/** Sprint 32 — apartados / anticipos. */
export function isSalesLayawayEnabled(): boolean {
  return flagOn(pub(PF + 'SALES_LAYAWAY'));
}

/** Sprint 32 — diario contable solo lectura. */
export function isLedgerChartOfAccountsEnabled(): boolean {
  return flagOn(pub(PF + 'LEDGER_CHART_OF_ACCOUNTS'));
}

/** Sprint 33 — cotizaciones / presupuestos. */
export function isSalesQuotesEnabled(): boolean {
  return flagOn(pub(PF + 'SALES_QUOTES'));
}

/** Sprint 34 — devolución a proveedor. */
export function isPurchasingReturnsEnabled(): boolean {
  return flagOn(pub(PF + 'PURCHASING_RETURNS'));
}

/** Sprint 35 — crédito de tienda / gift cards. */
export function isLedgerStoreCreditEnabled(): boolean {
  return flagOn(pub(PF + 'LEDGER_STORE_CREDIT'));
}

/** Sprint 36 — cuotas / pago en partes. */
export function isSalesInstallmentsEnabled(): boolean {
  return flagOn(pub(PF + 'SALES_INSTALLMENTS'));
}

/** Sprint 37 — comisiones de vendedor. */
export function isSalesCommissionsEnabled(): boolean {
  return flagOn(pub(PF + 'SALES_COMMISSIONS'));
}

/** Sprint 38 — ubicaciones y racks. */
export function isInventoryLocationsEnabled(): boolean {
  return flagOn(pub(PF + 'INVENTORY_LOCATIONS'));
}

/** Sprint 39 — serial identity and terminal leases. */
export function isInventorySerialsEnabled(): boolean {
  return flagOn(pub(PF + 'INVENTORY_SERIALS'));
}
