/**
 * Orquestación post-commit: compile → outbox → transport → ACK.
 */
import type {
  PrintJobRecord,
  PrintTicketSnapshot,
  PrinterStrategy,
} from '@kipuspay/print-templates';
import { createOffloadClient, type OffloadClient } from './offload-client.js';
import type { PrintOutboxStore } from './print-outbox-store.js';
import type { PrinterTransport } from './printer-transport.js';

export async function enqueueAndPrintTicket(input: {
  readonly outbox: PrintOutboxStore;
  readonly transport: PrinterTransport;
  readonly saleId: string;
  readonly ticket: PrintTicketSnapshot;
  readonly preferredAdapter?: PrinterStrategy | null;
  readonly offload?: OffloadClient;
}): Promise<{
  readonly printed: boolean;
  readonly adapter?: PrinterStrategy;
  readonly error?: string;
}> {
  const isLocalOffload = !input.offload;
  const offload = input.offload ?? createOffloadClient();
  let escPosBase64: string | null;
  try {
    escPosBase64 = await offload.compileEscPos(input.ticket).catch(() => null);
  } finally {
    if (isLocalOffload) {
      offload.dispose();
    }
  }
  const now = Date.now();
  const record: PrintJobRecord = {
    saleId: input.saleId,
    ticket: input.ticket,
    escPosBase64,
    status: 'PENDING',
    preferredAdapter: input.preferredAdapter ?? null,
    lastError: null,
    enqueuedAtMs: now,
    updatedAtMs: now,
  };
  await input.outbox.enqueue(record);

  const result = await input.transport.print({
    ticket: input.ticket,
    escPosBase64,
    preferredAdapter: input.preferredAdapter,
  });
  if (result.ok) {
    await input.outbox.markPrinted(input.saleId);
    await input.outbox.ackDelete(input.saleId);
    return { printed: true, adapter: result.adapter };
  }
  await input.outbox.markFailed(input.saleId, result.error);
  return { printed: false, adapter: result.adapter, error: result.error };
}
