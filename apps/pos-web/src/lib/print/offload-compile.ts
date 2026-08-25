/**
 * Compilación ESC/POS off-main (§7.5) — usable en Worker o main thread (tests).
 * H2 (auditoría 0031): buildSaleTicketSnapshot es EL punto único donde se
 * construye el payload QR fiscal (RS 402-2019) con el builder de
 * print-templates. Fail-closed: sin RUC/hash/fecha no se genera QR parcial.
 */
import {
  assertPrintPayloadSize,
  buildEscPosPayload,
  buildFiscalQrPayload,
  bytesToBase64,
  type PrintTicketSnapshot,
  type TicketData,
} from '@kipuspay/print-templates';

const CPE_TYPES: readonly string[] = ['01', '03', '07', '08'];

export function snapshotToTicketData(snap: PrintTicketSnapshot): TicketData {
  return {
    enterprise: snap.enterprise,
    ruc: snap.ruc,
    documentType: snap.documentType,
    series: snap.series,
    number: snap.number,
    totalCents: snap.totalCents,
    items: snap.items.map((i) => ({ name: i.name, qty: i.qty, totalCents: i.totalCents })),
    lineWidth: snap.lineWidth,
    ...(snap.digestValue !== undefined ? { digestValue: snap.digestValue } : {}),
    ...(snap.qrPayload !== undefined ? { qrPayload: snap.qrPayload } : {}),
    ...(snap.issueDateIso !== undefined ? { issueDateIso: snap.issueDateIso } : {}),
    ...(snap.igvCents !== undefined ? { igvCents: snap.igvCents } : {}),
    ...(snap.buyer !== undefined ? { buyer: snap.buyer } : {}),
    ...(snap.brandFooter !== undefined ? { brandFooter: snap.brandFooter } : {}),
  };
}

/**
 * C7 — snapshot post-cobro a partir de la venta offline ya encolada y del
 * correlativo reservado. `ruc` se deja vacío cuando el tenant no lo expone
 * (NV/control interno, contrato TicketData); nunca se inventa un RUC demo.
 * H2: cuando hay datos CPE completos (tipo fiscal + RUC + hash + fecha)
 * construye aquí la cadena QR RS 402-2019; en CPE pendiente o NV no hay QR.
 */
export function buildSaleTicketSnapshot(input: {
  readonly enterprise: string;
  readonly ruc: string;
  readonly documentType: string;
  readonly series: string;
  readonly number: number;
  readonly totalCents: number;
  readonly items: readonly {
    readonly name: string;
    readonly qty: number;
    readonly totalCents: number;
  }[];
  readonly lineWidth?: number;
  readonly brandFooter?: PrintTicketSnapshot['brandFooter'];
  readonly issueDateIso?: string;
  readonly igvCents?: number;
  readonly digestValue?: string;
  readonly buyer?: NonNullable<PrintTicketSnapshot['buyer']>;
}): PrintTicketSnapshot {
  const isCpe = CPE_TYPES.includes(input.documentType);
  const qrReady = isCpe && input.ruc.length > 0 && !!input.digestValue && !!input.issueDateIso;
  return {
    enterprise: input.enterprise,
    ruc: input.ruc,
    documentType: input.documentType,
    series: input.series,
    number: input.number,
    totalCents: input.totalCents,
    items: input.items.map((i) => ({ name: i.name, qty: i.qty, totalCents: i.totalCents })),
    lineWidth: input.lineWidth ?? 32,
    ...(qrReady
      ? {
          qrPayload: buildFiscalQrPayload({
            ruc: input.ruc,
            documentType: input.documentType,
            series: input.series,
            number: input.number,
            igvCents: input.igvCents ?? 0,
            totalCents: input.totalCents,
            issueDateIso: input.issueDateIso,
            buyerDocType: input.buyer?.docType,
            buyerDocNumber: input.buyer?.docNumber,
            digestValue: input.digestValue,
          }),
        }
      : {}),
    ...(input.digestValue !== undefined ? { digestValue: input.digestValue } : {}),
    ...(input.issueDateIso !== undefined ? { issueDateIso: input.issueDateIso } : {}),
    ...(input.igvCents !== undefined ? { igvCents: input.igvCents } : {}),
    ...(input.buyer !== undefined ? { buyer: input.buyer } : {}),
    ...(input.brandFooter ? { brandFooter: input.brandFooter } : {}),
  };
}

export function compileEscPosFromSnapshot(snap: PrintTicketSnapshot): {
  readonly bytes: Uint8Array;
  readonly escPosBase64: string;
} {
  assertPrintPayloadSize(snap); // S25-H1: DoS guard en el worker
  const bytes = buildEscPosPayload(snapshotToTicketData(snap));
  return { bytes, escPosBase64: bytesToBase64(bytes) };
}

export type OffloadRequest =
  | {
      readonly type: 'COMPILE_ESC_POS';
      readonly requestId: string;
      readonly ticket: PrintTicketSnapshot;
    }
  | { readonly type: 'PING'; readonly requestId: string };

export type OffloadResponse =
  | {
      readonly type: 'ESC_POS_READY';
      readonly requestId: string;
      readonly escPosBase64: string;
    }
  | { readonly type: 'PONG'; readonly requestId: string }
  | { readonly type: 'ERROR'; readonly requestId: string; readonly error: string };

export function handleOffloadMessage(data: OffloadRequest): OffloadResponse {
  try {
    if (data.type === 'PING') return { type: 'PONG', requestId: data.requestId };
    if (data.type === 'COMPILE_ESC_POS') {
      const { escPosBase64 } = compileEscPosFromSnapshot(data.ticket);
      return { type: 'ESC_POS_READY', requestId: data.requestId, escPosBase64 };
    }
    return {
      type: 'ERROR',
      requestId: (data as { requestId: string }).requestId,
      error: 'UNKNOWN',
    };
  } catch (e) {
    return {
      type: 'ERROR',
      requestId: data.requestId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
