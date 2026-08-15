/**
 * S2 (Sprint 7) — rate limit por ventana fija sobre KV (sin binding de pago).
 * Protege los endpoints públicos del abuso (bootstrap/claim/referrals).
 * Fail-open sin KV (el límite es defensa de costo, no de confidencialidad):
 * si KV no está disponible, la petición pasa y se registra.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface RateLimitKvLike {
  get(key: string): Promise<string | null>;
  put?(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitState {
  readonly count: number;
  readonly windowStartedMs: number;
}

export function readRateLimitState(raw: string | null, nowMs: number): RateLimitState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { count?: unknown; windowStartedMs?: unknown };
    if (
      typeof parsed.count !== 'number' ||
      typeof parsed.windowStartedMs !== 'number' ||
      Number.isNaN(parsed.count) ||
      Number.isNaN(parsed.windowStartedMs)
    ) {
      return null;
    }
    if (nowMs - parsed.windowStartedMs > 0) {
      // Ventana caducada: se reinicia al contar (no aquí: devuelve estado viejo).
    }
    return { count: parsed.count, windowStartedMs: parsed.windowStartedMs };
  } catch {
    return null;
  }
}

export function buildRateLimitState(count: number, nowMs: number): RateLimitState {
  return { count, windowStartedMs: nowMs };
}

/**
 * Decisión determinista sin KV: la ventana arranca en nowMs y se incrementa.
 * El call-site decide persistir con buildRateLimitState.
 */
export function decideRateLimit(
  previous: RateLimitState | null,
  limit: number,
  windowMs: number,
  nowMs: number,
): { decision: RateLimitDecision; next: RateLimitState } {
  let windowStartedMs = previous?.windowStartedMs ?? nowMs;
  let count = previous?.count ?? 0;
  if (previous && nowMs - previous.windowStartedMs >= windowMs) {
    windowStartedMs = nowMs;
    count = 0;
  }
  count += 1;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const retryAfterSeconds = Math.max(0, Math.ceil((windowStartedMs + windowMs - nowMs) / 1000));
  return { decision: { allowed, remaining, retryAfterSeconds }, next: { count, windowStartedMs } };
}

/**
 * Ejecuta el rate limit con KV. Devuelve la decisión (allowed=false → 429).
 * `kv` tipado estructuralmente (KVNamespace real o fake de test).
 */
export async function enforceRateLimit(input: {
  readonly kv: RateLimitKvLike | null | undefined;
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly nowMs?: number;
}): Promise<{ decision: RateLimitDecision; persisted: boolean }> {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.kv) {
    // Fail-open sin KV: sin estado compartido no hay límite que imponer.
    return {
      decision: { allowed: true, remaining: input.limit, retryAfterSeconds: 0 },
      persisted: false,
    };
  }
  const windowMs = input.windowSeconds * 1000;
  const raw = await input.kv.get(`rl:${input.key}`);
  const previous = readRateLimitState(raw, nowMs);
  const { decision, next } = decideRateLimit(previous, input.limit, windowMs, nowMs);
  if (input.kv.put) {
    await input.kv.put(`rl:${input.key}`, JSON.stringify(next), {
      expirationTtl: Math.ceil(windowMs / 1000) + 5,
    });
  }
  return { decision, persisted: input.kv.put != null };
}

export function rateLimitKey(ip: string, route: string): string {
  return `${route}:${ip || 'unknown'}`;
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? '';
}
