/**
 * Breaker in-memory (tests + coalesced write path sin workerd).
 */
import {
  applyInfraFailures,
  applyProbeFailure,
  applyProbeSuccess,
  BREAKER_KV_TTL_SECONDS,
  BREAKER_OPEN_MS,
  breakerDoName,
  initialBreakerSnapshot,
  transitionToHalfOpen,
  type BreakerSnapshot,
  type FiscalEndpoint,
} from '@kipuspay/domain-fiscal-pe';
import { writeBreakerOpenToKv, type BreakerKvLike } from './breaker-read-cache.js';

const store = new Map<string, BreakerSnapshot>();

export function resetMemoryBreakerForTests(): void {
  store.clear();
}

export async function memoryBreakerIncrement(
  kv: BreakerKvLike | null,
  transport: string,
  endpoint: FiscalEndpoint,
  count: number,
  nowMs: number = Date.now(),
): Promise<BreakerSnapshot> {
  const key = breakerDoName(transport, endpoint);
  let snap = store.get(key) ?? initialBreakerSnapshot();
  snap = applyInfraFailures(snap, count, nowMs);
  store.set(key, snap);
  if (kv) await writeBreakerOpenToKv(kv, transport, endpoint, snap, BREAKER_KV_TTL_SECONDS);
  return snap;
}

export function memoryBreakerAlarm(
  transport: string,
  endpoint: FiscalEndpoint,
  nowMs: number = Date.now(),
): Promise<BreakerSnapshot> {
  const key = breakerDoName(transport, endpoint);
  let snap = store.get(key) ?? initialBreakerSnapshot();
  snap = transitionToHalfOpen(snap, nowMs);
  store.set(key, snap);
  return Promise.resolve(snap);
}

export async function memoryBreakerProbe(
  kv: BreakerKvLike | null,
  transport: string,
  endpoint: FiscalEndpoint,
  ok: boolean,
  nowMs: number = Date.now(),
): Promise<BreakerSnapshot> {
  const key = breakerDoName(transport, endpoint);
  let snap = store.get(key) ?? initialBreakerSnapshot();
  snap = ok ? applyProbeSuccess(snap) : applyProbeFailure(snap, nowMs);
  store.set(key, snap);
  if (kv) await writeBreakerOpenToKv(kv, transport, endpoint, snap, BREAKER_KV_TTL_SECONDS);
  return snap;
}

export function memoryBreakerGet(transport: string, endpoint: FiscalEndpoint): BreakerSnapshot {
  return store.get(breakerDoName(transport, endpoint)) ?? initialBreakerSnapshot();
}

export { BREAKER_OPEN_MS };
