import {
  applyCdrToSaleStatus,
  createMockPseTransport,
  type FiscalSubmitRequest,
} from '@kipuspay/adapters-sunat';
import { cdrIsAccepted, breakerDoName, type FiscalEndpoint } from '@kipuspay/domain-fiscal-pe';
import { FiscalCircuitBreaker } from './fiscal-circuit-breaker.js';
import { readBreakerOpen, type BreakerKvLike } from './breaker-read-cache.js';
import { coalesceInfraFailure } from './breaker-coalesce.js';
import { drainFiscalOutbox, type FiscalDrainDb, type FiscalXmlR2 } from './fiscal-drain.js';

export { FiscalCircuitBreaker };

export interface CdrPayload {
  readonly cdrCode: string;
  readonly cdrDescription: string;
  readonly accepted: boolean;
}

export interface FiscalWorkerEnv {
  readonly FEATURE_FISCAL_RC?: string;
  readonly FEATURE_FISCAL_CIRCUIT_BREAKER?: string;
  readonly FEATURE_FISCAL_TRANSPORT_PLUGINS?: string;
  readonly FISCAL_BREAKER_KV?: BreakerKvLike;
  readonly FISCAL_XML_R2?: FiscalXmlR2;
  readonly DB?: FiscalDrainDb;
  readonly FISCAL_CIRCUIT_BREAKER_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  };
}

export function cdrVerdict(payload: CdrPayload): 'aceptada' | 'rechazada' {
  return cdrIsAccepted(payload) ? 'aceptada' : 'rechazada';
}

export function isFiscalRcEnabled(env: FiscalWorkerEnv): boolean {
  return env.FEATURE_FISCAL_RC === '1' || env.FEATURE_FISCAL_RC === 'true';
}

export function isFiscalCircuitBreakerEnabled(env: FiscalWorkerEnv): boolean {
  return (
    env.FEATURE_FISCAL_CIRCUIT_BREAKER === '1' || env.FEATURE_FISCAL_CIRCUIT_BREAKER === 'true'
  );
}

export function isFiscalTransportPluginsEnabled(env: FiscalWorkerEnv): boolean {
  return (
    env.FEATURE_FISCAL_TRANSPORT_PLUGINS === '1' || env.FEATURE_FISCAL_TRANSPORT_PLUGINS === 'true'
  );
}

export async function submitViaMockPse(request: FiscalSubmitRequest): Promise<{
  verdict: 'aceptada' | 'rechazada' | 'cuarentena';
  sunatStatus: 'ACCEPTED' | 'REJECTED' | 'QUARANTINED';
}> {
  const transport = createMockPseTransport();
  const outcome = await transport.submit(request);
  const sunatStatus = await applyCdrToSaleStatus(outcome);
  const verdict =
    sunatStatus === 'ACCEPTED'
      ? 'aceptada'
      : sunatStatus === 'REJECTED'
        ? 'rechazada'
        : 'cuarentena';
  return { verdict, sunatStatus };
}

export async function reportInfraFailure(
  env: FiscalWorkerEnv,
  endpoint: FiscalEndpoint,
): Promise<void> {
  if (!isFiscalCircuitBreakerEnabled(env)) return;
  const key = breakerDoName('KIPUSPAY_PSE_DIRECT', endpoint);
  // B7 (47b): solo se envía cuando la ventana de coalesce cierra (delta real).
  // Antes, flushCoalesce forzado en CADA fallo destruía el bucket y el DO
  // recibía un incremento por fallo (doble/inflado conteo) más una re-invocación.
  const count = coalesceInfraFailure(key, Date.now());
  if (count <= 0) return;
  const ns = env.FISCAL_CIRCUIT_BREAKER_DO;
  if (!ns) return;
  const stub = ns.get(ns.idFromName(key));
  const path =
    'https://breaker.local/increment?transport=' + 'KIPUSPAY_PSE_DIRECT' + '&endpoint=' + endpoint;
  await stub.fetch(
    new Request(path, {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),
  );
}

async function handleCdr(request: Request): Promise<Response> {
  const payload: CdrPayload = await request.json();
  return new Response(JSON.stringify({ verdict: cdrVerdict(payload) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleSubmit(request: Request, env: FiscalWorkerEnv): Promise<Response> {
  if (isFiscalCircuitBreakerEnabled(env)) {
    const open = await readBreakerOpen(
      env.FISCAL_BREAKER_KV ?? null,
      'KIPUSPAY_PSE_DIRECT',
      'submit',
    );
    if (open) {
      return new Response(JSON.stringify({ error: 'BREAKER_OPEN', code: 'BREAKER_OPEN' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
  }
  const body: FiscalSubmitRequest = await request.json();
  const result = await submitViaMockPse(body);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleDrain(env: FiscalWorkerEnv): Promise<Response> {
  if (!isFiscalCircuitBreakerEnabled(env) || !env.DB || !env.FISCAL_XML_R2) {
    return new Response(JSON.stringify({ error: 'FEATURE_OFF' }), { status: 404 });
  }
  const result = await drainFiscalOutbox({
    db: env.DB,
    r2: env.FISCAL_XML_R2,
    isBreakerOpen: () =>
      readBreakerOpen(env.FISCAL_BREAKER_KV ?? null, 'KIPUSPAY_PSE_DIRECT', 'submit'),
    onInfraFailure: () => reportInfraFailure(env, 'submit'),
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function handleRcStatus(env: FiscalWorkerEnv): Response {
  if (!isFiscalRcEnabled(env)) {
    return new Response(JSON.stringify({ enabled: false }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ enabled: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: FiscalWorkerEnv = {}): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/cdr' && request.method === 'POST') return handleCdr(request);
    if (url.pathname === '/v1/fiscal/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }
    if (url.pathname === '/v1/fiscal/drain' && request.method === 'POST') {
      return handleDrain(env);
    }
    if (url.pathname === '/v1/fiscal/rc/status' && request.method === 'GET') {
      return handleRcStatus(env);
    }
    return new Response('not found', { status: 404 });
  },
};
