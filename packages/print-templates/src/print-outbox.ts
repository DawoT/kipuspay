/**
 * Contrato PrintOutbox (§7.5) — puro, sin IndexedDB.
 * PENDING/FAILED bloquean cierre Z (edge 2D); PRINTED se borra tras ACK.
 */
import type { TicketBrandFooter } from './ticket-data.js';

export type PrintJobStatus = 'PENDING' | 'PRINTED' | 'FAILED';
export type PrintJobKind = 'SALE_TICKET' | 'PRICE_LABEL_BATCH';

export type PrinterStrategy = 'webusb' | 'wss_lan' | 'bluetooth' | 'system_print' | 'whatsapp';

/** Payload mínimo recompilable del ticket (JSON-serializable). */
export interface PrintTicketSnapshot {
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
  readonly lineWidth: number;
  readonly digestValue?: string;
  readonly qrPayload?: string;
  /** H2 (auditoría 0031): fecha de emisión ISO yyyy-mm-dd (CPE). */
  readonly issueDateIso?: string;
  /** H2: sumatoria IGV en cents. */
  readonly igvCents?: number;
  /** H2: adquirente o usuario (denominación + documento). */
  readonly buyer?: {
    readonly name?: string;
    readonly docType?: string;
    readonly docNumber?: string;
  };
  /** S12-H2: pie de marca "Emitido con KipusPay" (opcional, opt-out tenant). */
  readonly brandFooter?: TicketBrandFooter;
}

export interface PrintJobRecord {
  /** Generic identity. Legacy ticket producers may continue using saleId only. */
  readonly jobId?: string;
  readonly kind?: 'SALE_TICKET';
  readonly blocksCashClose?: true;
  readonly saleId: string;
  readonly ticket: PrintTicketSnapshot;
  /** Bytes ESC/POS (base64 en IDB); null = recompilar. */
  readonly escPosBase64: string | null;
  readonly status: PrintJobStatus;
  readonly preferredAdapter: PrinterStrategy | null;
  readonly lastError: string | null;
  readonly enqueuedAtMs: number;
  readonly updatedAtMs: number;
}

export interface PriceLabelPrintItemRecord {
  readonly itemId: string;
  readonly payloadBase64: string;
  readonly status: PrintJobStatus;
  readonly lastError: string | null;
}

export interface PriceLabelPrintJobRecord {
  readonly jobId: string;
  readonly kind: 'PRICE_LABEL_BATCH';
  readonly blocksCashClose: false;
  readonly items: readonly PriceLabelPrintItemRecord[];
  readonly enqueuedAtMs: number;
  readonly updatedAtMs: number;
}

export type GenericPrintJobRecord = PrintJobRecord | PriceLabelPrintJobRecord;

export interface PrintOutboxPort {
  enqueue(job: PrintJobRecord): Promise<void>;
  get(saleId: string): Promise<PrintJobRecord | undefined>;
  listBlocking(): Promise<readonly PrintJobRecord[]>;
  pendingCount(): Promise<number>;
  markPrinted(saleId: string): Promise<void>;
  markFailed(saleId: string, error: string): Promise<void>;
  /** ACK: borra el job (solo tras print OK). */
  ackDelete(saleId: string): Promise<void>;
}

/** S25-H1: tope de líneas por ticket compilado (DoS en el worker de
 * offload / memoria de la cola). 200 líneas cubren tickets reales con margen. */
export const MAX_PRINT_ITEMS = 200;

export function assertPrintPayloadSize(ticket: { readonly items: readonly unknown[] }): void {
  if (ticket.items.length > MAX_PRINT_ITEMS) {
    throw new Error(`PRINT_PAYLOAD_TOO_LARGE:${ticket.items.length}`);
  }
}

export function printJobKey(saleId: string): string {
  const id = saleId.trim();
  if (!id) throw new Error('PRINT_JOB_SALE_ID_EMPTY');
  return `print_jobs/${id}`;
}

/** PENDING + FAILED cuentan para edge 2D. */
export function countBlockingPrintJobs(
  jobs: readonly {
    readonly status: PrintJobStatus;
    readonly blocksCashClose?: boolean;
    readonly kind?: PrintJobKind;
  }[],
): number {
  let n = 0;
  for (const j of jobs) {
    if (j.blocksCashClose !== false && (j.status === 'PENDING' || j.status === 'FAILED')) {
      n += 1;
    }
  }
  return n;
}

export function assertPrintJobTransition(from: PrintJobStatus, to: PrintJobStatus): void {
  const allowed: Record<PrintJobStatus, readonly PrintJobStatus[]> = {
    PENDING: ['PRINTED', 'FAILED'],
    FAILED: ['PENDING', 'PRINTED'],
    PRINTED: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`PRINT_JOB_INVALID:${from}->${to}`);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
