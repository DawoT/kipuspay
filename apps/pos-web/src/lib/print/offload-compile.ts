/**
 * Compilación ESC/POS off-main (§7.5) — usable en Worker o main thread (tests).
 */
import {
  buildEscPosPayload,
  bytesToBase64,
  type PrintTicketSnapshot,
  type TicketData,
} from '@kipuspay/print-templates';

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
  };
}

export function compileEscPosFromSnapshot(snap: PrintTicketSnapshot): {
  readonly bytes: Uint8Array;
  readonly escPosBase64: string;
} {
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
