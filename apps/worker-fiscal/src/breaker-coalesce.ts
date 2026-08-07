/**
 * Coalesce de fallos INFRA — 1 incremento DO por ventana ~5s (§8.1).
 */
import { BREAKER_COALESCE_WINDOW_MS } from '@kipuspay/domain-fiscal-pe';

export interface CoalesceBucket {
  count: number;
  windowStartedAtMs: number;
}

const buckets = new Map<string, CoalesceBucket>();

export function resetCoalesceForTests(): void {
  buckets.clear();
}

/**
 * Acumula fallos. Cuando la ventana cierra, retorna el delta a enviar al DO
 * y resetea el bucket. Dentro de la ventana retorna 0 (aún coalesciendo).
 */
export function coalesceInfraFailure(
  key: string,
  nowMs: number,
  windowMs: number = BREAKER_COALESCE_WINDOW_MS,
): number {
  const cur = buckets.get(key);
  if (!cur) {
    buckets.set(key, { count: 1, windowStartedAtMs: nowMs });
    return 0;
  }
  if (nowMs - cur.windowStartedAtMs < windowMs) {
    cur.count += 1;
    return 0;
  }
  const flush = cur.count;
  buckets.set(key, { count: 1, windowStartedAtMs: nowMs });
  return flush;
}

/** Forzar flush (fin de drain / tests). */
export function flushCoalesce(key: string): number {
  const cur = buckets.get(key);
  if (!cur || cur.count === 0) return 0;
  const n = cur.count;
  buckets.delete(key);
  return n;
}

export function jitterMs(baseMs: number, random: () => number = Math.random): number {
  return baseMs + Math.floor(random() * baseMs);
}
