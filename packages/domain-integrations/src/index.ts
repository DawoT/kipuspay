import type { Cents } from '@kipuspay/domain-sales';
import type {
  CatalogImportInput,
  CatalogImportPlan,
  CatalogImportResult,
} from './catalog-import.js';

export type {
  CatalogEntityType,
  CatalogImportAction,
  CatalogImportConflict,
  CatalogImportInput,
  CatalogImportPlan,
  CatalogImportResult,
  CatalogImportRow,
  CatalogImportSource,
  NormalizedCustomerRow,
  NormalizedProductRow,
  NormalizedSeriesRow,
  TaxMapping,
} from './catalog-import.js';
export {
  externalKeyFor,
  mapExternalTax,
  planCatalogImport,
  summarizeImportPlan,
  validateCatalogRow,
} from './catalog-import.js';

export type {
  CaptureStatus,
  OfflineCaptureStatus,
  PaymentAcquirerCode,
  PaymentChargeRequest,
  PaymentChargeResult,
  PaymentMethodCode,
  PaymentStatusRequest,
  PaymentWebhookVerifyInput,
  PaymentWebhookVerifyResult,
} from './payment-capture.js';
export {
  assertCaptureTransition,
  assertOfflineCapturePolicy,
  assertWebhookFreshness,
  buildCaptureIdempotencyKey,
  isCardMethod,
  isCashMethod,
  isElectronicMethod,
  isPaymentMethodCode,
  isWalletMethod,
  MANUAL_CAPTURE_AMBER_COPY,
  methodCodeToAcquirer,
  WEBHOOK_REPLAY_WINDOW_SEC,
} from './payment-capture.js';
export type { PaymentAcquirerPort } from './payment-capture.js';

export interface PriceLookupPort {
  priceCentsFor(productId: string): Promise<Cents>;
}

export interface AccountingExportPort {
  exportMovements(movements: readonly object[]): Promise<{ exportedCount: number }>;
}

/**
 * Puerto de importación de catálogo (S21, §5.4).
 * Regla 1: commit solo después de un dry-run aprobado (preview → confirmar).
 */
export interface CatalogImporterPort {
  preview(input: CatalogImportInput): Promise<CatalogImportPlan>;
  commit(plan: CatalogImportPlan): Promise<CatalogImportResult>;
}

export function aggregateImportsPerSource(
  entries: readonly { readonly source: string }[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }
  return counts;
}
