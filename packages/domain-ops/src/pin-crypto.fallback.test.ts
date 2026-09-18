/**
 * Cobertura fail-closed de pin-crypto (CAL-05): el wasm del
 * vendor bloqueado → no se crea un hash débil como sustituto. El vendor se mockea
 * para forzar el catch de loadArgon2 sin depender del runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./vendor/argon2-bundled.js', () => {
  return {
    default: {
      ArgonType: { Argon2id: 2 },
      hash: async () => {
        throw new Error('WASM_BLOCKED_BY_EMBEDDER');
      },
      verify: async () => {
        throw new Error('WASM_RUNTIME_UNAVAILABLE');
      },
    },
  };
});

import { hashPinArgon2id } from './pin-crypto.js';

describe('pin-crypto fail-closed (vendor wasm bloqueado)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no reemplaza Argon2id por SHA-256 cuando el WASM no está disponible', async () => {
    await expect(hashPinArgon2id('1234')).rejects.toThrow('WASM_BLOCKED_BY_EMBEDDER');
  });

  it('distingue la indisponibilidad del runtime de un PIN incorrecto', async () => {
    vi.doMock('./argon2-worker-runtime.js', () => ({
      loadWorkerArgon2: async () => {
        throw new Error('WASM_UNAVAILABLE');
      },
    }));
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });

    const { verifyPinHash } = await import('./pin-crypto.js');

    await expect(verifyPinHash('1234', '$argon2id$v=19$m=65536,t=3,p=1$abc$def')).rejects.toThrow(
      'WASM_UNAVAILABLE',
    );
  });

  it('propaga una falla del cálculo verify en vez de convertirla en PIN incorrecto', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Node.js' });
    const { verifyPinHash } = await import('./pin-crypto.js');

    await expect(verifyPinHash('1234', '$argon2id$v=19$m=65536,t=3,p=1$abc$def')).rejects.toThrow(
      'WASM_RUNTIME_UNAVAILABLE',
    );
    vi.unstubAllGlobals();
  });
});
