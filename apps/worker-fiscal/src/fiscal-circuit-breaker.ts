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
      const body = (await request.json().catch(() => ({}))) as { count?: number };
      const count = Math.max(1, Math.floor(body.count ?? 1));
      const now = Date.now();
      let snap = await this.load();
      snap = applyInfraFailures(snap, count, now);
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
