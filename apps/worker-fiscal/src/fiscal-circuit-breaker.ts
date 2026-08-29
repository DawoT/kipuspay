/**
 * FiscalCircuitBreaker DO — autoritativo; solo escrituras + alarm half-open.
 * Lecturas hot-path = isolate/KV (breaker-read-cache).
 */
import { DurableObject } from 'cloudflare:workers';
import {
  applyInfraFailures,
  applyProbeFailure,
  applyProbeSuccess,
  BREAKER_KV_TTL_SECONDS,
  BREAKER_OPEN_MS,
  initialBreakerSnapshot,
  transitionToHalfOpen,
  type BreakerSnapshot,
  type FiscalEndpoint,
} from '@kipuspay/domain-fiscal-pe';
import { writeBreakerOpenToKv, type BreakerKvLike } from './breaker-read-cache.js';

export interface FiscalBreakerEnv {
  readonly FISCAL_BREAKER_KV?: BreakerKvLike;
  readonly ANALYTICS_ENGINE?: {
    writeDataPoint(data: {
      readonly blobs?: string[];
      readonly doubles?: number[];
      readonly indexes?: string[];
    }): void;
  };
}

export function emitBreakerAnalytics(
  env: FiscalBreakerEnv,
  failureCount: number,
  errorClass: 'INFRA' | 'BUSINESS',
  transport: string,
  endpoint: FiscalEndpoint,
): void {
  try {
    env.ANALYTICS_ENGINE?.writeDataPoint({
      indexes: ['breaker:fiscal'],
      doubles: [failureCount],
      blobs: [transport, endpoint, errorClass],
    });
  } catch {
    // best-effort: AE muestreado nunca bloquea breaker
  }
}

/**
 * Taxonomía estricta §8.1 — INFRA abre breaker, BUSINESS solo emite sin mutar.
 */
export function handleBreakerTaxonomy(
  snap: BreakerSnapshot,
  env: FiscalBreakerEnv,
  errorClass: 'INFRA' | 'BUSINESS',
  transport: string,
  endpoint: FiscalEndpoint,
  count: number,
  nowMs: number,
): BreakerSnapshot {
  if (errorClass === 'INFRA') {
    const next = applyInfraFailures(snap, count, nowMs);
    emitBreakerAnalytics(env, next.failureCount, 'INFRA', transport, endpoint);
    return next;
  }
  // BUSINESS 4xx — jamás abre breaker
  emitBreakerAnalytics(env, snap.failureCount, 'BUSINESS', transport, endpoint);
  return snap;
}

const STORAGE_KEY = 'snap';

export class FiscalCircuitBreaker extends DurableObject<FiscalBreakerEnv> {
  private async load(): Promise<BreakerSnapshot> {
    return (await this.ctx.storage.get<BreakerSnapshot>(STORAGE_KEY)) ?? initialBreakerSnapshot();
  }

  private async save(snap: BreakerSnapshot): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, snap);
  }

  private async publish(
    snap: BreakerSnapshot,
    transport: string,
    endpoint: FiscalEndpoint,
  ): Promise<void> {
    const kv = this.env.FISCAL_BREAKER_KV;
    if (!kv) return;
    await writeBreakerOpenToKv(kv, transport, endpoint, snap, BREAKER_KV_TTL_SECONDS);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const transport = url.searchParams.get('transport') ?? 'KIPUSPAY_PSE_DIRECT';
    const endpoint = (url.searchParams.get('endpoint') ?? 'submit') as FiscalEndpoint;

    if (request.method === 'GET' && url.pathname === '/status') {
      // Solo para ops/tests — no hot path de submit
      const snap = await this.load();
      return Response.json(snap);
    }

    if (request.method === 'POST' && url.pathname === '/increment') {
      const body = (await request.json().catch(() => ({}))) as {
        count?: number;
        errorClass?: string;
      };
      const count = Math.max(1, Math.floor(body.count ?? 1));
      const rawClass =
        typeof body.errorClass === 'string' ? body.errorClass.toUpperCase() : 'INFRA';
      const errorClass: 'INFRA' | 'BUSINESS' = rawClass === 'BUSINESS' ? 'BUSINESS' : 'INFRA';
      const now = Date.now();
      let snap = await this.load();
      if (errorClass === 'BUSINESS') {
        emitBreakerAnalytics(this.env, snap.failureCount, 'BUSINESS', transport, endpoint);
        return Response.json(snap);
      }
      snap = handleBreakerTaxonomy(snap, this.env, 'INFRA', transport, endpoint, count, now);
      await this.save(snap);
      await this.ctx.storage.put('meta', { transport, endpoint });
      if (snap.state === 'open' && snap.openedAtMs !== null) {
        await this.ctx.storage.setAlarm(snap.openedAtMs + BREAKER_OPEN_MS);
      }
      await this.publish(snap, transport, endpoint);
      return Response.json(snap);
    }

    if (request.method === 'POST' && url.pathname === '/probe-success') {
      let snap = await this.load();
      snap = applyProbeSuccess(snap);
      await this.save(snap);
      await this.ctx.storage.put('meta', { transport, endpoint });
      await this.publish(snap, transport, endpoint);
      return Response.json(snap);
    }

    if (request.method === 'POST' && url.pathname === '/probe-failure') {
      const now = Date.now();
      let snap = await this.load();
      snap = applyProbeFailure(snap, now);
      await this.save(snap);
      await this.ctx.storage.put('meta', { transport, endpoint });
      if (snap.openedAtMs !== null) {
        await this.ctx.storage.setAlarm(snap.openedAtMs + BREAKER_OPEN_MS);
      }
      await this.publish(snap, transport, endpoint);
      return Response.json(snap);
    }

    return new Response('Not Found', { status: 404 });
  }

  override async alarm(): Promise<void> {
    let snap = await this.load();
    snap = transitionToHalfOpen(snap, Date.now());
    await this.save(snap);
    const meta = (await this.ctx.storage.get<{ transport: string; endpoint: FiscalEndpoint }>(
      'meta',
    )) ?? {
      transport: 'KIPUSPAY_PSE_DIRECT',
      endpoint: 'submit',
    };
    await this.publish(snap, meta.transport, meta.endpoint);
  }
}
