/**
 * FiscalService — WorkerEntrypoint expuesto a worker-api vía service binding.
 * C6: centraliza el drain con el producer (produceFiscalXmlForSale) y el cron
 * self-healing. worker-api no toca R2/DB fiscales directamente; invoca
 * `drain`/`produceMissing` por RPC y el worker-fiscal hace el trabajo real.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { produceFiscalXmlForSale, type D1DatabaseLike } from '@kipuspay/adapters-d1';
import {
  createHttpPseTransport,
  createMockPseTransport,
  type FiscalTransport,
} from '@kipuspay/adapters-sunat';
import { breakerDoName } from '@kipuspay/domain-fiscal-pe';
import { readBreakerOpen } from './breaker-read-cache.js';
import { coalesceInfraFailure } from './breaker-coalesce.js';
import { drainFiscalOutbox, type FiscalDrainDb, type FiscalXmlR2 } from './fiscal-drain.js';
import { bootstrapBreakerCold } from './breaker-bootstrap.js';

export interface FiscalServiceEnv {
  readonly DB?: FiscalDrainDb & D1DatabaseLike;
  readonly FISCAL_XML_R2?: FiscalXmlR2;
  readonly FISCAL_PSE_ENDPOINT_URL?: string;
  readonly FEATURE_FISCAL_CIRCUIT_BREAKER?: string;
  readonly FEATURE_FISCAL_TRANSPORT_PLUGINS?: string;
  readonly FISCAL_BREAKER_KV?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: unknown): Promise<void>;
  };
  readonly FISCAL_CIRCUIT_BREAKER_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  };
}

function isPluginsEnabled(env: FiscalServiceEnv): boolean {
  return env.FEATURE_FISCAL_TRANSPORT_PLUGINS === '1' || env.FEATURE_FISCAL_TRANSPORT_PLUGINS === 'true';
}

function isBreakerEnabled(env: FiscalServiceEnv): boolean {
  return (
    env.FEATURE_FISCAL_CIRCUIT_BREAKER === '1' || env.FEATURE_FISCAL_CIRCUIT_BREAKER === 'true'
  );
}

function selectTransport(env: FiscalServiceEnv): FiscalTransport {
  const endpoint = env.FISCAL_PSE_ENDPOINT_URL?.trim();
  if (isPluginsEnabled(env) && endpoint) {
    return createHttpPseTransport({ endpointUrl: endpoint });
  }
  return createMockPseTransport();
}

export default class FiscalService extends WorkerEntrypoint<FiscalServiceEnv> {
  private async isBreakerOpen(): Promise<boolean> {
    const env = this.env;
    if (!isBreakerEnabled(env)) return false;
    const open = await readBreakerOpen(env.FISCAL_BREAKER_KV ?? null, 'KIPUSPAY_PSE_DIRECT', 'submit');
    if (!open) return false;
    const bootstrapped = await bootstrapBreakerCold(env, 'KIPUSPAY_PSE_DIRECT', 'submit');
    return !bootstrapped;
  }

  private async onInfraFailure(): Promise<void> {
    const env = this.env;
    if (!isBreakerEnabled(env)) return;
    const key = breakerDoName('KIPUSPAY_PSE_DIRECT', 'submit');
    const count = coalesceInfraFailure(key, Date.now());
    if (count <= 0) return;
    const ns = env.FISCAL_CIRCUIT_BREAKER_DO;
    if (!ns) return;
    const stub = ns.get(ns.idFromName(key));
    const path =
      'https://breaker.local/increment?transport=' + 'KIPUSPAY_PSE_DIRECT' + '&endpoint=' + 'submit';
    await stub.fetch(
      new Request(path, { method: 'POST', body: JSON.stringify({ count }) }),
    );
  }

  /** Drain completo: reclama filas y produce el XML que falte (self-healing). */
  async drain(options: { readonly limit?: number } = {}): Promise<unknown> {
    const env = this.env;
    if (!env.DB || !env.FISCAL_XML_R2) {
      return { error: 'FEATURE_OFF', code: 'FEATURE_OFF' };
    }
    const db = env.DB;
    const r2 = env.FISCAL_XML_R2;
    return drainFiscalOutbox({
      db,
      r2,
      transport: selectTransport(env),
      isBreakerOpen: () => this.isBreakerOpen(),
      onInfraFailure: () => this.onInfraFailure(),
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      produceMissingXml: ({ tenantId, saleId }) =>
        produceFiscalXmlForSale({
          db,
          r2,
          tenantId,
          saleId,
        }),
    });
  }

  /** Produce el XML de una venta individual (post-commit best-effort). */
  async produceMissing(input: { readonly tenantId: string; readonly saleId: string }): Promise<unknown> {
    const env = this.env;
    if (!env.DB || !env.FISCAL_XML_R2) {
      return { outcome: 'FEATURE_OFF' };
    }
    return produceFiscalXmlForSale({
      db: env.DB,
      r2: env.FISCAL_XML_R2,
      tenantId: input.tenantId,
      saleId: input.saleId,
    });
  }
}