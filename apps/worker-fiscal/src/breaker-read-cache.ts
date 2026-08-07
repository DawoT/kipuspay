/**
 * Caché de lectura del breaker — isolate → KV; DO nunca en hot path (§8.1).
 */
import {
  BREAKER_ISOLATE_TTL_MS,
  breakerKvKey,
  type FiscalEndpoint,
  isBreakerOpen,
  type BreakerSnapshot,
  initialBreakerSnapshot,
} from '@kipuspay/domain-fiscal-pe';

export interface BreakerKvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface IsolateEntry {
  readonly open: boolean;
  readonly expiresAtMs: number;
}

const isolateCache = new Map<string, IsolateEntry>();

/** Contador de lecturas DO (solo tests/chaos — producción = 0 en hot path). */
let doReadCount = 0;

export function resetBreakerReadCacheForTests(): void {
  isolateCache.clear();
  doReadCount = 0;
}

export function getDoReadCountForTests(): number {
  return doReadCount;
}

export function recordDoReadForTests(): void {
  doReadCount += 1;
}

/**
 * Lee flag open. Fail-closed: stale closed ≥ TTL → treat as open.
 * Nunca llama al DO.
 */
export async function readBreakerOpen(
  kv: BreakerKvLike | null,
  transport: string,
  endpoint: FiscalEndpoint,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const key = breakerKvKey(transport, endpoint);
  const local = isolateCache.get(key);
  if (local && nowMs < local.expiresAtMs) {
    return local.open;
  }
  // Stale closed → fail-closed (treat open)
  if (local && !local.open && nowMs >= local.expiresAtMs) {
    isolateCache.set(key, { open: true, expiresAtMs: nowMs + BREAKER_ISOLATE_TTL_MS });
    return true;
  }

  if (!kv) {
    // Sin KV: fail-closed acotado si no hay cache fresco
    return true;
  }
  const raw = await kv.get(key);
  const open = raw === '1' || raw === 'open';
  isolateCache.set(key, { open, expiresAtMs: nowMs + BREAKER_ISOLATE_TTL_MS });
  return open;
}

export async function writeBreakerOpenToKv(
  kv: BreakerKvLike,
  transport: string,
  endpoint: FiscalEndpoint,
  snap: BreakerSnapshot,
  ttlSeconds: number,
): Promise<void> {
  const key = breakerKvKey(transport, endpoint);
  const open = isBreakerOpen(snap) || snap.state === 'open';
  await kv.put(key, open ? '1' : '0', { expirationTtl: ttlSeconds });
  isolateCache.set(key, {
    open,
    expiresAtMs: Date.now() + BREAKER_ISOLATE_TTL_MS,
  });
}

export function seedIsolateClosed(
  transport: string,
  endpoint: FiscalEndpoint,
  nowMs: number,
): void {
  isolateCache.set(breakerKvKey(transport, endpoint), {
    open: false,
    expiresAtMs: nowMs + BREAKER_ISOLATE_TTL_MS,
  });
}

export { initialBreakerSnapshot };
