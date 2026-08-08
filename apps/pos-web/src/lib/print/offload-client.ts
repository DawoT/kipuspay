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

interface OffloadWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: OffloadRequest): void;
  terminate(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOffloadResponse(value: unknown): value is OffloadResponse {
  if (!isRecord(value) || typeof value.requestId !== 'string') return false;
  if (value.type === 'ESC_POS_READY') return typeof value.escPosBase64 === 'string';
  if (value.type === 'ERROR') return typeof value.error === 'string';
  return value.type === 'PONG';
}

function isOffloadWorkerPort(value: unknown): value is OffloadWorkerPort {
  return (
    isRecord(value) &&
    typeof value.postMessage === 'function' &&
    typeof value.terminate === 'function'
  );
}

export function createOffloadClient(): OffloadClient {
  let worker: OffloadWorkerPort | null = null;
  let seq = 0;
  const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  const rejectAll = (error: Error) => {
    for (const slot of pending.values()) slot.reject(error);
    pending.clear();
  };

  try {
    if (typeof Worker !== 'undefined') {
      const candidate: unknown = new Worker(new URL('./offload.worker.ts', import.meta.url), {
        type: 'module',
      });
      if (!isOffloadWorkerPort(candidate)) throw new Error('WORKER_PORT_INVALID');
      worker = candidate;
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const data: unknown = event.data;
        if (!isOffloadResponse(data)) {
          const requestId =
            isRecord(data) && typeof data.requestId === 'string' ? data.requestId : undefined;
          const slot = requestId === undefined ? undefined : pending.get(requestId);
          if (requestId !== undefined) pending.delete(requestId);
          if (slot) slot.reject(new Error('WORKER_RESPONSE_INVALID'));
          else rejectAll(new Error('WORKER_RESPONSE_INVALID'));
          return;
        }
        const msg = data;
        const slot = pending.get(msg.requestId);
        if (!slot) return;
        pending.delete(msg.requestId);
        if (msg.type === 'ESC_POS_READY') slot.resolve(msg.escPosBase64);
        else if (msg.type === 'ERROR') slot.reject(new Error(msg.error));
        else if (msg.type === 'PONG') slot.resolve('pong');
      };
      worker.onerror = (event: ErrorEvent) => {
        const message = event.message || 'WORKER_UNHANDLED_ERROR';
        rejectAll(new Error(message));
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
      const activeWorker = worker;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('OFFLOAD_TIMEOUT'));
        }, 5000);

        pending.set(requestId, {
          resolve: (val) => {
            clearTimeout(timer);
            resolve(val);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        const req: OffloadRequest = { type: 'COMPILE_ESC_POS', requestId, ticket };
        activeWorker.postMessage(req);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      rejectAll(new Error('OFFLOAD_CLIENT_DISPOSED'));
    },
  };
}
