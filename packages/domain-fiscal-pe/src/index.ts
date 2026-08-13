/**
 * Dominio fiscal Perú — Arquitectura §5.1 / ADR-FISCAL-001 v2.
 * Puro: sin D1, Hono ni SDK SUNAT.
 */

/** Constantes legales (única fuente de verdad — §5.1 decisión 6). */
export const DOC_TOTAL_THRESHOLD_FOR_ID = 70_000; // S/ 700
export const NRUS_UNITARY_OMISSION_CENTS = 500; // S/ 5
export const FACTURA_SUBMIT_DAYS = 3;
export const BOLETA_RC_SUBMIT_DAYS = 7; // consumer: buildDailySummary / plazos RC

export type FormalizationMode = 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';

export type TaxRegime = 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';

export type DocumentTypeCode = 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12';

export type PseMode = 'KIPUSPAY_PSE' | 'TENANT_CERT';

export const DEFAULT_PSE_MODE: PseMode = 'KIPUSPAY_PSE';

export {
  assertValidFacturaXml,
  assertWellFormedXml,
  buildUblInvoiceXml,
  hashUblXml,
  type UblInvoiceInput,
  type UblInvoiceLine,
} from './ubl-invoice.js';

export {
  assertCreditNoteAllowed,
  stockRestoreMicrounits,
  stockRestoreQuantity,
  type CreditNoteOrigin,
  type CreditNoteRequest,
  type OriginSunatStatus,
} from './credit-note.js';

export {
  assertDebitNoteAllowed,
  debitNoteStockImpact,
  DEBIT_NOTE_MOTIVE_CODES,
  type DebitNoteMotiveCode,
  type DebitNoteOrigin,
  type DebitNoteRequest,
} from './debit-note.js';

export {
  assertRemissionGuideAllowed,
  remissionStockImpact,
  TRANSFER_REASON_CODES,
  TRANSPORT_MODE_CODES,
  type RemissionGuideRequest,
  type TransferReasonCode,
  type TransportModeCode,
} from './remission-guide.js';

export interface CdrEnvelope {
  readonly cdrCode: string;
  readonly cdrDescription: string;
  readonly accepted: boolean;
}

export interface InvoiceDescriptor {
  readonly issuerRuc: string;
  readonly series: string;
  readonly correlative: number;
}

export function cdrIsAccepted(cdr: CdrEnvelope): boolean {
  return cdr.accepted && cdr.cdrCode === '0';
}

export function formalizeDescriptor(descriptor: InvoiceDescriptor): string {
  return `${descriptor.series}-${String(descriptor.correlative).padStart(8, '0')}`;
}

/** NV nunca se encola a SUNAT. */
export function isSunatApplicable(documentType: DocumentTypeCode): boolean {
  return documentType !== 'NV' && documentType !== 'NV_RETURN';
}

export function defaultSunatStatus(documentType: DocumentTypeCode): 'NOT_APPLICABLE' | 'PENDING' {
  return isSunatApplicable(documentType) ? 'PENDING' : 'NOT_APPLICABLE';
}

/** must_submit_by para factura (+3d); boleta deja PENDING sin RC en Sprint 5. */
export function computeMustSubmitByIso(
  documentType: DocumentTypeCode,
  issuedAtMs: number,
): string | null {
  if (documentType === '01') {
    const deadline = issuedAtMs + FACTURA_SUBMIT_DAYS * 24 * 3600 * 1000;
    return new Date(deadline).toISOString();
  }
  if (documentType === '03' || documentType === '12') {
    // RC window stamped +7d for pipeline readiness (FIS-03).
    const deadline = issuedAtMs + BOLETA_RC_SUBMIT_DAYS * 24 * 3600 * 1000;
    return new Date(deadline).toISOString();
  }
  return null;
}

const CPE_CODES: ReadonlySet<DocumentTypeCode> = new Set(['01', '03', '07', '08', '12']);

export function isCpeDocument(documentType: DocumentTypeCode): boolean {
  return CPE_CODES.has(documentType);
}

export interface EmissionContext {
  readonly formalizationMode: FormalizationMode;
  readonly taxRegime: TaxRegime;
  readonly documentType: DocumentTypeCode;
  readonly totalAmountCents: number;
  readonly clientDocumentType: string;
  readonly clientDocumentNumber: string;
  readonly clientName: string;
}

export type EmissionGuardError =
  | 'CPE_BLOCKED_INTERNAL_CONTROL'
  | 'FACTURA_REQUIRES_RUC'
  | 'BOLETA_ID_REQUIRED'
  | 'DOCUMENT_NOT_ALLOWED_FOR_REGIME';

/**
 * Matriz régimen × modo × documento (§5.1).
 * Lanza Error con código de guard si no cumple.
 */
export function assertEmissionAllowed(ctx: EmissionContext): void {
  const { formalizationMode, taxRegime, documentType } = ctx;

  if (formalizationMode === 'INTERNAL_CONTROL') {
    if (isCpeDocument(documentType)) {
      throw new Error('CPE_BLOCKED_INTERNAL_CONTROL');
    }
    return;
  }

  // FORMALIZING / ELECTRONIC_ISSUER — NV opcional
  if (documentType === 'NV' || documentType === 'NV_RETURN') {
    return;
  }

  assertCpeAllowedForRegime(taxRegime, documentType);
  assertFacturaRuc(ctx);
  assertBoletaIdentity(ctx);
}

function assertCpeAllowedForRegime(taxRegime: TaxRegime, documentType: DocumentTypeCode): void {
  if (taxRegime === 'UNKNOWN') {
    throw new Error('DOCUMENT_NOT_ALLOWED_FOR_REGIME');
  }
  if (taxRegime === 'NRUS' && documentType === '01') {
    throw new Error('DOCUMENT_NOT_ALLOWED_FOR_REGIME');
  }
}

function assertFacturaRuc(ctx: EmissionContext): void {
  if (ctx.documentType !== '01') return;
  if (ctx.clientDocumentType !== '6' || !/^\d{11}$/.test(ctx.clientDocumentNumber)) {
    throw new Error('FACTURA_REQUIRES_RUC');
  }
}

function assertBoletaIdentity(ctx: EmissionContext): void {
  if (ctx.documentType !== '03' && ctx.documentType !== '12') return;
  if (ctx.totalAmountCents < DOC_TOTAL_THRESHOLD_FOR_ID) return;
  const hasDoc = Boolean(ctx.clientDocumentType?.trim() && ctx.clientDocumentNumber?.trim());
  const hasName = Boolean(ctx.clientName?.trim());
  if (!hasDoc || !hasName) {
    throw new Error('BOLETA_ID_REQUIRED');
  }
}

export interface SeriesResolveInput {
  readonly documentType: DocumentTypeCode;
  readonly branchSeries: readonly {
    readonly id: string;
    readonly series: string;
    readonly documentTypeCode: string;
    readonly currentNumber: number;
    readonly isActive: boolean;
  }[];
  readonly requestedSeries: string;
}

export interface SeriesResolveResult {
  readonly seriesId: string;
  readonly series: string;
  readonly currentNumber: number;
}

/** Resuelve serie activa de sucursal para el tipo pedido. */
export function resolveBranchSeries(input: SeriesResolveInput): SeriesResolveResult {
  const code = input.documentType === 'NV_RETURN' ? 'NV_RETURN' : input.documentType;
  const match = input.branchSeries.find(
    (s) => s.isActive && s.documentTypeCode === code && s.series === input.requestedSeries,
  );
  if (!match) throw new Error('SERIES_NOT_FOUND');
  return {
    seriesId: match.id,
    series: match.series,
    currentNumber: match.currentNumber,
  };
}

/** Leyenda legal obligatoria en impresión NV. */
export const NV_LEGAL_LEGEND =
  'Nota de venta — documento de control interno. No es comprobante de pago autorizado por SUNAT.';

export {
  ALERT_T24_MS,
  ALERT_T6_MS,
  boletaMustSubmitByEndOfLimaDay,
  evaluateDeadline,
  evaluateDeadlineBatch,
  facturaMustSubmitBy,
  summaryDateLima,
  type DeadlineAction,
  type DeadlineAlertKind,
  type DeadlineCandidate,
} from './deadlines.js';

export {
  assertRcKeyIsEmisorDay,
  cashCloseMustNotTriggerRc,
  planDailySummary,
  type BoletaForRc,
  type DailySummaryPlan,
} from './daily-summary.js';

export {
  assertVoidBoletaAllowed,
  markVoidedAfterRc,
  type VoidBoletaContext,
  type VoidBoletaResult,
  type VoidStatus,
} from './void-boleta.js';

export {
  canOmitUnitaryNrus,
  planNrusDailyConsolidation,
  type NrusConsolidateLine,
  type NrusConsolidatePlan,
  type NrusOmitCandidate,
} from './nrus.js';

export { buildOwnerAlert, requiresOwnerAlert, type OwnerAlertPayload } from './owner-alerts.js';

export {
  assertWithinRetention,
  mintPortalToken,
  renderCpePortalHtml,
  verifyPortalToken,
  type CpePortalLookup,
  type CpePortalView,
} from './cpe-portal.js';

export {
  formalizationBannerMessage,
  suggestDocumentType,
  type SuggestDocCode,
  type SuggestDocumentInput,
  type SuggestFormalizationMode,
  type SuggestTaxRegime,
} from './document-selector.js';

export {
  advanceFormalization,
  assertDocumentTypeEnabled,
  assertFormalizationAdvance,
  enabledDocumentTypesFor,
} from './formalization-advance.js';

export {
  assertCpeInvoiceDto,
  assertCpeSummaryDto,
  type CPEInvoiceDTO,
  type CPESummaryDTO,
  type CpeDocumentType,
} from './cpe-dto.js';

export {
  applyBusinessFailure,
  applyInfraFailures,
  applyProbeFailure,
  applyProbeSuccess,
  breakerDoName,
  breakerKvKey,
  BREAKER_COALESCE_WINDOW_MS,
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_ISOLATE_TTL_MS,
  BREAKER_KV_TTL_SECONDS,
  BREAKER_OPEN_MS,
  initialBreakerSnapshot,
  isBreakerOpen,
  transitionToHalfOpen,
  type BreakerSnapshot,
  type BreakerState,
  type FiscalEndpoint,
} from './circuit-breaker.js';
