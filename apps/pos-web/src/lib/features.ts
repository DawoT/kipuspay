/** Feature flags cliente (PUBLIC_*). Default off. */

function flagOn(value: string | boolean | undefined): boolean {
  return value === '1' || value === 'true' || value === true;
}

export function isPosCheckoutEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_POS_CHECKOUT as string | undefined);
}

export function isPrintTemplatesEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_PRINT_TEMPLATES as string | undefined);
}

export function isVitrinaEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_VITRINA as string | undefined);
}

export function isOwnerModeEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_OWNER_MODE as string | undefined);
}

export function isOwnerPushEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_OWNER_PUSH as string | undefined);
}

export function isLedgerArApEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_LEDGER_AR_AP as string | undefined);
}

export function isReportingCatalogEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_REPORTING_CATALOG as string | undefined);
}

export function isReportingExportEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_REPORTING_EXPORT as string | undefined);
}

/** Sprint 17 — cierre Z ciego / movimientos / reprints. */
export function isCashBlindZEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_CASH_BLIND_Z as string | undefined);
}

/** Sprint 18 — FEFO / BOM / conteo / merma / alertas. */
export function isInventoryOpsEnabled(): boolean {
  return (
    flagOn(import.meta.env.PUBLIC_FEATURE_INVENTORY_BATCHES as string | undefined) ||
    flagOn(import.meta.env.PUBLIC_FEATURE_INVENTORY_BOM as string | undefined)
  );
}
