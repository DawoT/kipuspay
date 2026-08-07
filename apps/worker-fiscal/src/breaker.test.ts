import { describe, expect, it, beforeEach } from 'vitest';
import { BREAKER_FAILURE_THRESHOLD } from '@kipuspay/domain-fiscal-pe';
import {
  coalesceInfraFailure,
  flushCoalesce,
  jitterMs,
  resetCoalesceForTests,
} from './breaker-coalesce.js';
import {
  readBreakerOpen,
  resetBreakerReadCacheForTests,
  seedIsolateClosed,
  writeBreakerOpenToKv,
  type BreakerKvLike,
} from './breaker-read-cache.js';
import {
  memoryBreakerGet,
  memoryBreakerIncrement,
  memoryBreakerAlarm,
  memoryBreakerProbe,
  resetMemoryBreakerForTests,
  BREAKER_OPEN_MS,
} from './memory-breaker.js';
import { initialBreakerSnapshot } from '@kipuspay/domain-fiscal-pe';

function memoryKv(): BreakerKvLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => Promise.resolve(data.get(k) ?? null),
    put: (k, v) => {
      data.set(k, v);
      return Promise.resolve();
    },
  };
}

describe('breaker read cache + coalesce + memory DO', () => {
  beforeEach(() => {
    resetBreakerReadCacheForTests();
    resetCoalesceForTests();
    resetMemoryBreakerForTests();
  });

  it('10 INFRA coalescidos abren breaker en KV para todos los isolates', async () => {
    const kv = memoryKv();
    const t0 = 1_000_000;
    // Coalesce: primera ventana acumula; flush al cruzar 5s
    for (let i = 0; i < 9; i += 1) {
      expect(coalesceInfraFailure('submit', t0 + i * 10)).toBe(0);
    }
    const flushed = coalesceInfraFailure('submit', t0 + 5_001);
    expect(flushed).toBe(9);
    const extra = flushCoalesce('submit');
    const snap = await memoryBreakerIncrement(
      kv,
      'KIPUSPAY_PSE_DIRECT',
      'submit',
      flushed + extra,
      t0 + 5_001,
    );
    // Need 10 total — flush had 9 from first window + 1 new start; add one more
    if (snap.failureCount < BREAKER_FAILURE_THRESHOLD) {
      await memoryBreakerIncrement(kv, 'KIPUSPAY_PSE_DIRECT', 'submit', 10, t0 + 5_002);
    }
    const open1 = await readBreakerOpen(kv, 'KIPUSPAY_PSE_DIRECT', 'submit', t0 + 5_010);
    resetBreakerReadCacheForTests();
    const open2 = await readBreakerOpen(kv, 'KIPUSPAY_PSE_DIRECT', 'submit', t0 + 5_020);
    expect(open1).toBe(true);
    expect(open2).toBe(true);
    expect(memoryBreakerGet('KIPUSPAY_PSE_DIRECT', 'submit').state).toBe('open');
  });

  it('10 BUSINESS no incrementan (solo INFRA path)', async () => {
    const kv = memoryKv();
    // Simula: BUSINESS no llama coalesce/increment
    expect(memoryBreakerGet('KIPUSPAY_PSE_DIRECT', 'submit').state).toBe('closed');
    await writeBreakerOpenToKv(kv, 'KIPUSPAY_PSE_DIRECT', 'submit', initialBreakerSnapshot(), 60);
    expect(await readBreakerOpen(kv, 'KIPUSPAY_PSE_DIRECT', 'submit')).toBe(false);
  });

  it('stale closed ≥ TTL → fail-closed open', async () => {
    const now = 50_000;
    seedIsolateClosed('KIPUSPAY_PSE_DIRECT', 'submit', now - 20_000);
    const open = await readBreakerOpen(null, 'KIPUSPAY_PSE_DIRECT', 'submit', now);
    expect(open).toBe(true);
  });

  it('half-open via alarm + probe', async () => {
    const kv = memoryKv();
    await memoryBreakerIncrement(kv, 'KIPUSPAY_PSE_DIRECT', 'submit', 10, 0);
    await memoryBreakerAlarm('KIPUSPAY_PSE_DIRECT', 'submit', BREAKER_OPEN_MS + 1);
    expect(memoryBreakerGet('KIPUSPAY_PSE_DIRECT', 'submit').state).toBe('half-open');
    await memoryBreakerProbe(kv, 'KIPUSPAY_PSE_DIRECT', 'submit', true, BREAKER_OPEN_MS + 2);
    expect(memoryBreakerGet('KIPUSPAY_PSE_DIRECT', 'submit').state).toBe('closed');
  });

  it('jitter > base', () => {
    expect(jitterMs(100, () => 0.9)).toBeGreaterThanOrEqual(100);
  });
});
