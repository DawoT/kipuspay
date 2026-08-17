import {
  applyCdrToSaleStatus,
  createHttpPseTransport,
  createMockPseTransport,
  type FiscalSubmitRequest,
  type FiscalTransport,
} from '@kipuspay/adapters-sunat';
import {
  cdrIsAccepted,
  breakerDoName,
  type FiscalEndpoint,
} from '@kipuspay/domain-fiscal-pe';
import { FiscalCircuitBreaker } from './fiscal-circuit-breaker.js';
import {
  readBreakerOpen,
  type BreakerKvLike,
} from './breaker-read-cache.js';
import { coalesceInfraFailure } from './breaker-coalesce.js';
import { drainFiscalOutbox, type FiscalDrainDb, type FiscalXmlR2 } from './fiscal-drain.js';

export { FiscalCircuitBreaker };
export { default as FiscalService } from './fiscal-service.js';

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
  /** F5-2: endpoint del PSE KipusPay (HTTP real). Sin él, el transporte
   *  permanece en MOCK_STAGING documentado (nunca se mezcla). */
  readonly FISCAL_PSE_ENDPOINT_URL?: string;
  /** F5-2: fetchImpl inyectable para tests del transporte HTTP. */
  readonly FISCAL_PSE_FETCH?: typeof fetch;
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

/**
 * F5-2: selecciona el transporte fiscal (ADR-FISCAL-002 / §8.1).
 * - flag on + endpoint → PSE KipusPay HTTP real (createHttpPseTransport).
 * - cualquier otro caso → MOCK_STAGING explícito (local/staging; el claim PSE
 *   comercial sigue congelado hasta la prueba de CDR en staging — ADR-FISCAL-001).
 * Nunca mezcla: sin endpoint no se intenta HTTP (fail-closed de configuración).
 */
export function selectFiscalTransport(env: FiscalWorkerEnv): FiscalTransport {
  const endpoint = env.FISCAL_PSE_ENDPOINT_URL?.trim();
  if (isFiscalTransportPluginsEnabled(env) && endpoint) {
    return createHttpPseTransport({
      endpointUrl: endpoint,
      ...(env.FISCAL_PSE_FETCH ? { fetchImpl: env.FISCAL_PSE_FETCH } : {}),
    });
  }
  return createMockPseTransport();
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

/** F5-2: submit por el transporte seleccionado (mock staging o PSE HTTP real). */
export async function submitViaSelectedTransport(
  env: FiscalWorkerEnv,
  request: FiscalSubmitRequest,
): Promise<{
  verdict: 'aceptada' | 'rechazada' | 'cuarentena';
  sunatStatus: 'ACCEPTED' | 'REJECTED' | 'QUARANTINED';
}> {
  const transport = selectFiscalTransport(env);
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
      const bootstrapped = await bootstrapBreakerCold(env, 'KIPUSPAY_PSE_DIRECT', 'submit');
      if (!bootstrapped) {
        return new Response(JSON.stringify({ error: 'BREAKER_OPEN', code: 'BREAKER_OPEN' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
  }
  const body: FiscalSubmitRequest = await request.json();
  const result = await submitViaSelectedTransport(env, body);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleDrain(env: FiscalWorkerEnv): Promise<Response> {
  if (!isFiscalCircuitBreakerEnabled(env) || !env.DB || !env.FISCAL_XML_R2) {
    return new Response(JSON.stringify({ error: 'FEATURE_OFF' }), { status: 404 });
  }
  let result: Awaited<ReturnType<typeof drainFiscalOutbox>>;
  try {
    result = await drainFiscalOutbox({
      db: env.DB,
      r2: env.FISCAL_XML_R2,
      transport: selectFiscalTransport(env),
      isBreakerOpen: async () => {
        const open = await readBreakerOpen(
          env.FISCAL_BREAKER_KV ?? null,
          'KIPUSPAY_PSE_DIRECT',
          'submit',
        );
        if (!open) return false;
        const bootstrapped = await bootstrapBreakerCold(env, 'KIPUSPAY_PSE_DIRECT', 'submit');
        return !bootstrapped;
      },
      onInfraFailure: () => reportInfraFailure(env, 'submit'),
    });
  } catch {
    return new Response(JSON.stringify({ error: 'DRAIN_FAILED', code: 'DRAIN_FAILED' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
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

/**
 * Bootstrap del breaker en arranque en frío — movido a breaker-bootstrap.ts
 * (compartido con FiscalService sin ciclo de imports).
 */
import { bootstrapBreakerCold } from './breaker-bootstrap.js';
export { bootstrapBreakerCold } from './breaker-bootstrap.js';

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

  /** C6: cron del drain — worker-fiscal se auto-reclama sin depender de worker-api. */
  scheduled(_controller: ScheduledController, env: FiscalWorkerEnv, ctx: ExecutionContext) {
    if (!env.DB || !env.FISCAL_XML_R2) return;
    ctx.waitUntil(handleDrain(env));
  },
};
