/**
 * Feature flags del worker API. Módulo único para no duplicar la lógica de
 * activación ni cruzar imports entre dominios (F6 Sprint 32).
 */
import type { WorkerEnv } from './control-plane.js';

function flagOn(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** Sprint 32 — apartados (FEATURE_SALES_LAYAWAY, default off). */
export function isSalesLayawayEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_SALES_LAYAWAY);
}

/** Sprint 33 — cotizaciones (FEATURE_SALES_QUOTES, default off). */
export function isSalesQuotesEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_SALES_QUOTES);
}

/** Sprint 32 — diario contable (FEATURE_LEDGER_CHART_OF_ACCOUNTS, default off). */
export function isLedgerChartOfAccountsEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS);
}

/** Sprint 22/23 — ledger AR/AP (FEATURE_LEDGER_AR_AP). */
export function isLedgerArApEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_LEDGER_AR_AP);
}

/** Sprint 35 — crédito de tienda / gift cards (FEATURE_LEDGER_STORE_CREDIT, default off). */
export function isLedgerStoreCreditEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_LEDGER_STORE_CREDIT);
}

/** Sprint 36 — cuotas / pago en partes (FEATURE_SALES_INSTALLMENTS, default off). */
export function isSalesInstallmentsEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_SALES_INSTALLMENTS);
}

/** Sprint 37 — comisiones de vendedor (FEATURE_SALES_COMMISSIONS, default off). */
export function isSalesCommissionsEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_SALES_COMMISSIONS);
}

/** Sprint 38 — ubicaciones/racks (FEATURE_INVENTORY_LOCATIONS, default off). */
export function isInventoryLocationsEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_INVENTORY_LOCATIONS);
}

/** Sprint 39 — serial identity (FEATURE_INVENTORY_SERIALS, default off). */
export function isInventorySerialsEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_INVENTORY_SERIALS);
}

/** Sprint 40 — venta por peso y balanza (default off). */
export function isInventoryScaleEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_INVENTORY_SCALE);
}

/** Sprint 41 — server-authoritative shelf price labels (default off). */
export function isCatalogPriceLabelsEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_CATALOG_PRICE_LABELS);
}

/** Sprint 43 — pedidos de cliente con reserva (default off). */
export function isCustomerOrdersEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_ORDERS_CUSTOMER_ORDERS);
}

/** Sprint 44 — ventas recurrentes/membresías (default off). */
export function isRecurringSalesEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_SALES_RECURRING);
}

/** Sprint 46 — analítica predictiva (FEATURE_ANALYTICS_FORECASTING, default off). */
export function isAnalyticsForecastingEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_ANALYTICS_FORECASTING);
}

/** Sprint 50 — alta rápida de catálogo (FEATURE_CATALOG_QUICK_ADD, default off). */
export function isCatalogQuickAddEnabled(
  env: { readonly FEATURE_CATALOG_QUICK_ADD?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_CATALOG_QUICK_ADD);
}

/** Sprint 51 — handoff de turno (FEATURE_SHIFT_HANDOFF, default off). */
export function isShiftHandoffEnabled(
  env: { readonly FEATURE_SHIFT_HANDOFF?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_SHIFT_HANDOFF);
}

/** Sprint 51 — equipo e invitaciones (FEATURE_TEAM_INVITE, default off). */
export function isTeamInviteEnabled(
  env: { readonly FEATURE_TEAM_INVITE?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_TEAM_INVITE);
}

/** Sprint 52 — Product Tour + setup checklist (FEATURE_ONBOARDING_TOUR, default off). */
export function isOnboardingTourEnabled(
  env: { readonly FEATURE_ONBOARDING_TOUR?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_ONBOARDING_TOUR);
}

/** Backlog v10 P2 — propinas (FEATURE_SALE_TIP, default off). */
export function isSaleTipEnabled(env: { readonly FEATURE_SALE_TIP?: string } | undefined): boolean {
  return flagOn(env?.FEATURE_SALE_TIP);
}

/** Backlog v10 P2 — cajón de efectivo (FEATURE_CASH_DRAWER, default off). */
export function isCashDrawerEnabled(
  env: { readonly FEATURE_CASH_DRAWER?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_CASH_DRAWER);
}

/** Backlog v10 P1c — Percepciones/Retenciones (FEATURE_FISCAL_WITHHOLDINGS, default off). */
export function isWithholdingsEnabled(
  env: { readonly FEATURE_FISCAL_WITHHOLDINGS?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_FISCAL_WITHHOLDINGS);
}

/** Backlog v10 P1b — GRE (FEATURE_GRE, default off). */
export function isGreEnabled(env: { readonly FEATURE_GRE?: string } | undefined): boolean {
  return flagOn(env?.FEATURE_GRE);
}

/** Backlog v10 P1a — Nota de Débito (FEATURE_SALES_DEBIT_NOTE, default off). */
export function isDebitNoteEnabled(
  env: { readonly FEATURE_SALES_DEBIT_NOTE?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_SALES_DEBIT_NOTE);
}

/** Sprint 53 — Troubleshooter de hardware (FEATURE_HARDWARE_DIAGNOSTICS, default off). */
export function isHardwareDiagnosticsEnabled(
  env: { readonly FEATURE_HARDWARE_DIAGNOSTICS?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_HARDWARE_DIAGNOSTICS);
}

/** Sprint 49 — inteligencia del negocio (FEATURE_ANALYTICS_AGENTIC_INSIGHTS, default off). */
export function isAgenticInsightsEnabled(
  env: { readonly FEATURE_ANALYTICS_AGENTIC_INSIGHTS?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_ANALYTICS_AGENTIC_INSIGHTS);
}

/** Sprint 47 — LPDP datos personales (FEATURE_LPDP, default off). */
export function isLpdpEnabled(env: WorkerEnv | undefined): boolean {
  return flagOn(env?.FEATURE_LPDP);
}

/** Grifos — surtidores e isla (FEATURE_FUEL_STATION, default off). */
export function isFuelStationEnabled(
  env: { readonly FEATURE_FUEL_STATION?: string } | undefined,
): boolean {
  return flagOn(env?.FEATURE_FUEL_STATION);
}
