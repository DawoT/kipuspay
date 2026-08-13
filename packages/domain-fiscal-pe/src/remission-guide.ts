/**
 * Guía de Remisión Electrónica `31` — Backlog v10 P1b (Arquitectura §5.2b,
 * ADR-FISCAL-004).
 *
 * La GRE declara un traslado de mercadería; NO es comprobante de pago y NO
 * toca stock ni saldos. Motivos del catálogo 18 (cerrado) + modalidad de
 * transporte, fecha/hora de inicio del traslado (hora Lima) obligatoria.
 * Puro: sin D1, sin deps de red.
 */

/** Motivos de traslado del catálogo 18 (subconjunto cerrado, ADR-FISCAL-004). */
export const TRANSFER_REASON_CODES = ['01', '02', '04', '08', '13', '14', '16'] as const;

export type TransferReasonCode = (typeof TRANSFER_REASON_CODES)[number];

/** Modalidad de transporte (catálogo 18 transporte). */
export const TRANSPORT_MODE_CODES = ['01', '02'] as const;

export type TransportModeCode = (typeof TRANSPORT_MODE_CODES)[number];

export interface RemissionGuideRequest {
  readonly series: string;
  readonly transferReasonCode: string;
  readonly transportModeCode: string;
  readonly vehiclePlate: string;
  readonly carrier: {
    readonly documentType: string;
    readonly documentNumber: string;
    readonly name: string;
  };
  readonly origin: {
    readonly ubigeo: string;
    readonly address: string;
  };
  readonly destination: {
    readonly ubigeo: string;
    readonly address: string;
  };
  /** Fecha/hora de inicio del traslado (hora Lima, ISO). */
  readonly transferStartedAt: string;
  readonly relatedDocument?: {
    readonly documentType: string;
    readonly series: string;
    readonly number: number;
  } | null;
  readonly items: readonly {
    readonly productId: string;
    readonly quantityMicrounits: number;
    readonly uomCode: string;
    readonly batchId?: string | null;
  }[];
}

export type RemissionGuardResult =
  { readonly ok: true } | { readonly ok: false; readonly code: string };

const DOC_TYPES = new Set(['01', '02', '03', '04']);

function transferError(request: RemissionGuideRequest): RemissionGuardResult | null {
  if (!TRANSFER_REASON_CODES.includes(request.transferReasonCode as TransferReasonCode)) {
    return { ok: false, code: 'INVALID_TRANSFER_REASON' };
  }
  if (!TRANSPORT_MODE_CODES.includes(request.transportModeCode as TransportModeCode)) {
    return { ok: false, code: 'INVALID_TRANSPORT_MODE' };
  }
  const startedAt = Date.parse(request.transferStartedAt);
  if (!Number.isFinite(startedAt)) {
    return { ok: false, code: 'INVALID_TRANSFER_START' };
  }
  if (
    !request.vehiclePlate.trim() ||
    !request.carrier.documentNumber.trim() ||
    !request.carrier.name.trim()
  ) {
    return { ok: false, code: 'INVALID_CARRIER' };
  }
  return null;
}

function carrierError(request: RemissionGuideRequest): RemissionGuardResult | null {
  if (!DOC_TYPES.has(request.carrier.documentType)) {
    return { ok: false, code: 'INVALID_CARRIER_DOCUMENT_TYPE' };
  }
  return null;
}

function pointsError(request: RemissionGuideRequest): RemissionGuardResult | null {
  if (
    !request.origin.ubigeo.trim() ||
    !request.origin.address.trim() ||
    !request.destination.ubigeo.trim() ||
    !request.destination.address.trim()
  ) {
    return { ok: false, code: 'INVALID_POINTS' };
  }
  return null;
}

function itemsError(request: RemissionGuideRequest): RemissionGuardResult | null {
  if (request.items.length === 0) {
    return { ok: false, code: 'EMPTY_ITEMS' };
  }
  for (const item of request.items) {
    if (!item.productId.trim()) return { ok: false, code: 'INVALID_ITEM_PRODUCT' };
    if (!Number.isSafeInteger(item.quantityMicrounits) || item.quantityMicrounits <= 0) {
      return { ok: false, code: 'INVALID_ITEM_QUANTITY' };
    }
    if (!item.uomCode.trim()) return { ok: false, code: 'INVALID_ITEM_UOM' };
  }
  return null;
}

function relatedDocumentError(request: RemissionGuideRequest): RemissionGuardResult | null {
  if (!request.relatedDocument) return null;
  if (
    !request.relatedDocument.series.trim() ||
    !Number.isInteger(request.relatedDocument.number) ||
    request.relatedDocument.number <= 0
  ) {
    return { ok: false, code: 'INVALID_RELATED_DOCUMENT' };
  }
  return null;
}

export function assertRemissionGuideAllowed(request: RemissionGuideRequest): RemissionGuardResult {
  const guards: RemissionGuardResult[] = [
    transferError(request),
    carrierError(request),
    pointsError(request),
    itemsError(request),
    relatedDocumentError(request),
  ].filter((r): r is RemissionGuardResult => r !== null);
  for (const result of guards) {
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** La GRE nunca impacta stock ni saldos monetarios. */
export function remissionStockImpact(): number {
  return 0;
}
