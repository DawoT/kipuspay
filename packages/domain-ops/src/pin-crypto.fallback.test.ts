/**
 * Cobertura del fallback fail-safe de pin-crypto (CAL-05): el wasm del
 * vendor bloqueado (entornos con CSP estricto) → hashPinArgon2id degrada a
 * SHA-256 con salt HEX y verifyPinHash es fail-closed. El vendor se mockea
 * para forzar el catch de loadArgon2 sin depender del runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./vendor/argon2-bundled.js', () => {
  return new Promise(() => {
    throw new Error('WASM_BLOCKED_BY_EMBEDDER');
  });
});

import { hashPinArgon2id, verifyPinHash } from './pin-crypto.js';

describe('pin-crypto fallback (vendor wasm bloqueado)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('hashPinArgon2id degrada a SHA-256 con salt HEX (fail-safe)', async () => {
    const h = await hashPinArgon2id('1234');
    expect(h).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });

  it('verifyPinHash del hash degradado: ok=true + needsRehash', async () => {
    const h = await hashPinArgon2id('1234');
    const ok = await verifyPinHash('1234', h);
    expect(ok).toMatchObject({ ok: true, needsRehash: true });
    const bad = await verifyPinHash('9999', h);
    expect(bad.ok).toBe(false);
  });
});
