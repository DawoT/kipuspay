import { describe, expect, it } from 'vitest';
import {
  buildRateLimitState,
  clientIp,
  decideRateLimit,
  enforceRateLimit,
  rateLimitKey,
  readRateLimitState,
} from './rate-limit.js';

function memoryKv() {
  const store = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(store.get(k) ?? null),
    put: (k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    },
    peek: (k: string) => store.get(k),
  };
}

describe('rate-limit (S2, KV window)', () => {
  it('permite hasta el límite y rechaza después con retryAfter', () => {
    const now = 1_000_000;
    let state: ReturnType<typeof buildRateLimitState> | null = null;
    const { decision: d1, next: n1 } = decideRateLimit(state, 3, 60_000, now);
    expect(d1.allowed).toBe(true);
    expect(d1.remaining).toBe(2);
    state = n1;
    const { decision: d2, next: n2 } = decideRateLimit(state, 3, 60_000, now);
    expect(d2.allowed).toBe(true);
    state = n2;
    const { decision: d3, next: n3 } = decideRateLimit(state, 3, 60_000, now);
    expect(d3.allowed).toBe(true);
    state = n3;
    const { decision: d4 } = decideRateLimit(state, 3, 60_000, now);
    expect(d4.allowed).toBe(false);
    expect(d4.remaining).toBe(0);
    expect(d4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reinicia la ventana al expirar', () => {
    const state = buildRateLimitState(3, 1_000);
    const { decision } = decideRateLimit(state, 3, 60_000, 1_000 + 60_000);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(2);
  });

  it('serializa/deserializa el estado (tolerante a basura)', () => {
    const state = buildRateLimitState(2, 123);
    expect(readRateLimitState(JSON.stringify(state), 1_000)).toEqual(state);
    expect(readRateLimitState('basura', 1_000)).toBeNull();
    expect(readRateLimitState(null, 1_000)).toBeNull();
    expect(readRateLimitState('{"count":"x","windowStartedMs":1}', 1_000)).toBeNull();
  });

  it('fail-open sin KV (persisted=false, always allowed)', async () => {
    const { decision, persisted } = await enforceRateLimit({
      kv: null,
      key: 'k',
      limit: 2,
      windowSeconds: 60,
    });
    expect(persisted).toBe(false);
    expect(decision.allowed).toBe(true);
  });

  it('enforceRateLimit persiste y cuenta sobre KV', async () => {
    const kv = memoryKv();
    const first = await enforceRateLimit({
      kv,
      key: 'x',
      limit: 2,
      windowSeconds: 60,
      nowMs: 1_000,
    });
    expect(first.decision.allowed).toBe(true);
    const second = await enforceRateLimit({
      kv,
      key: 'x',
      limit: 2,
      windowSeconds: 60,
      nowMs: 1_001,
    });
    expect(second.decision.allowed).toBe(true);
    const third = await enforceRateLimit({
      kv,
      key: 'x',
      limit: 2,
      windowSeconds: 60,
      nowMs: 1_002,
    });
    expect(third.decision.allowed).toBe(false);
    expect(third.decision.remaining).toBe(0);
    expect(kv.peek('rl:x')).toContain('windowStartedMs');
  });

  it('claves por ruta+IP; cf-connecting-ip ausente → unknown', () => {
    expect(rateLimitKey('1.2.3.4', '/v1/onboarding/bootstrap')).toBe(
      '/v1/onboarding/bootstrap:1.2.3.4',
    );
    expect(rateLimitKey('', '/x')).toBe('/x:unknown');
    expect(clientIp(new Request('https://x.test'))).toBe('');
    expect(
      clientIp(new Request('https://x.test', { headers: { 'cf-connecting-ip': '9.9.9.9' } })),
    ).toBe('9.9.9.9');
  });
});
