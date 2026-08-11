export {
  assertConsentPurpose,
  CONSENT_PURPOSES,
  isConsentActive,
  isConsentPurpose,
  planConsentChange,
  UNKNOWN_CONSENT_PURPOSE,
  type ConsentChangePlan,
  type ConsentPurpose,
  type ConsentRecord,
} from './consent.js';

export {
  ANONYMIZED_DOCUMENT,
  ANONYMIZED_NAME,
  assertNotErased,
  ALREADY_ERASED,
  CUSTOMER_PII_NULLABLE_FIELDS,
  isAnonymousDocument,
  planCustomerErase,
  type ConsentRevocationForErase,
  type CustomerForErase,
  type CustomerPiiField,
  type ErasePlan,
  type FiscalSnapshotForErase,
} from './erase.js';

export {
  buildCustomerExport,
  CUSTOMER_ERASED,
  type ConsentForExport,
  type CustomerExportPayload,
  type CustomerProfileForExport,
  type SaleForExport,
} from './export.js';

export {
  CUSTOMER_PII_CATALOG,
  isPiiCatalogField,
  projectPiiInventory,
  type CustomerPiiCatalogField,
  type CustomerRow,
  type PiiInventoryEntry,
} from './inventory.js';
