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
