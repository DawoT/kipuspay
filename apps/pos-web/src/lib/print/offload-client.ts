/**
 * Cliente del Web Worker de offload — fallback sync si Worker no disponible.
 */
import {
  handleOffloadMessage,
  type OffloadRequest,
  type OffloadResponse,
} from './offload-compile.js';
import type { PrintTicketSnapshot } from '@kipuspay/print-templates';

export interface OffloadClient {
  compileEscPos(ticket: PrintTicketSnapshot): Promise<string>;
  dispose(): void;
}

export function createOffloadClient(): OffloadClient {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();

  try {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./offload.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (ev: MessageEvent<OffloadResponse>) => {
        const msg = ev.data;
        const slot = pending.get(msg.requestId);
        if (!slot) return;
        pending.delete(msg.requestId);
        if (msg.type === 'ESC_POS_READY') slot.resolve(msg.escPosBase64);
        else if (msg.type === 'ERROR') slot.reject(new Error(msg.error));
        else if (msg.type === 'PONG') slot.resolve('pong');
      };
    }
  } catch {
    worker = null;
  }

  return {
    compileEscPos(ticket) {
      const requestId = `r${++seq}`;
      if (!worker) {
        const res = handleOffloadMessage({
          type: 'COMPILE_ESC_POS',
          requestId,
          ticket,
        });
        if (res.type === 'ESC_POS_READY') return Promise.resolve(res.escPosBase64);
        return Promise.reject(new Error(res.type === 'ERROR' ? res.error : 'COMPILE_FAILED'));
      }
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        const req: OffloadRequest = { type: 'COMPILE_ESC_POS', requestId, ticket };
        worker!.postMessage(req);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
}
