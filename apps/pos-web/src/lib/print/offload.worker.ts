/// <reference lib="webworker" />
import { handleOffloadMessage, type OffloadRequest } from './offload-compile.js';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<OffloadRequest>) => {
  const res = handleOffloadMessage(event.data);
  ctx.postMessage(res);
};
