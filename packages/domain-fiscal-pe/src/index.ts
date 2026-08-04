/**
 * Dominio fiscal Perú — Arquitectura §5.1 / ADR-FISCAL-001 v2.
 * Puro: sin D1, Hono ni SDK SUNAT.
 */

/** Constantes legales (única fuente de verdad — §5.1 decisión 6). */
export const DOC_TOTAL_THRESHOLD_FOR_ID = 70_000; // S/ 700
export const NRUS_UNITARY_OMISSION_CENTS = 500; // S/ 5
export const FACTURA_SUBMIT_DAYS = 3;
export const BOLETA_RC_SUBMIT_DAYS = 7; // Sprint 5b consumer

export type FormalizationMode =
  | 'INTERNAL_CONTROL'
  | 'FORMALIZING'
  | 'ELECTRONIC_ISSUER';

export type TaxRegime = 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';

export type DocumentTypeCode =
  | 'NV'
  | 'NV_RETURN'
  | '01'
  | '03'
  | '07'
  | '08'
  | '12';

export type PseMode = 'KIPUSPAY_PSE' | 'TENANT_CERT';

export const DEFAULT_PSE_MODE: PseMode = 'KIPUSPAY_PSE';

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

export function defaultSunatStatus(
  documentType: DocumentTypeCode,
): 'NOT_APPLICABLE' | 'PENDING' {
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
    // RC window is Sprint 5b; still stamp +7d for pipeline readiness.
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
  | 'DOCUMENT_NOT_ALLOWED_FOR_REGIME'
  | 'NV_BLOCKED_IN_FORMAL_MODE_WITHOUT_LEGEND'; // reserved; NV always allowed as internal

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

  // FORMALIZING / ELECTRONIC_ISSUER
  if (documentType === 'NV' || documentType === 'NV_RETURN') {
    return; // NV opcional con leyenda (copy fuera de este guard)
  }

  if (taxRegime === 'UNKNOWN') {
    throw new Error('DOCUMENT_NOT_ALLOWED_FOR_REGIME');
  }

  if (taxRegime === 'NRUS' && documentType === '01') {
    throw new Error('DOCUMENT_NOT_ALLOWED_FOR_REGIME');
  }

  if (documentType === '01') {
    if (ctx.clientDocumentType !== '6' || !/^\d{11}$/.test(ctx.clientDocumentNumber)) {
      throw new Error('FACTURA_REQUIRES_RUC');
    }
  }

  if (
    (documentType === '03' || documentType === '12') &&
    ctx.totalAmountCents >= DOC_TOTAL_THRESHOLD_FOR_ID
  ) {
    const hasDoc = Boolean(ctx.clientDocumentType?.trim() && ctx.clientDocumentNumber?.trim());
    const hasName = Boolean(ctx.clientName?.trim());
    if (!hasDoc || !hasName) {
      throw new Error('BOLETA_ID_REQUIRED');
    }
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
  const code =
    input.documentType === 'NV_RETURN' ? 'NV_RETURN' : input.documentType;
  const match = input.branchSeries.find(
    (s) =>
      s.isActive &&
      s.documentTypeCode === code &&
      s.series === input.requestedSeries,
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
