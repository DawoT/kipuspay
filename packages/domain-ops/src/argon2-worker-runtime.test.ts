import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('loadWorkerArgon2', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('publica la configuración WASM del Worker y devuelve la API Argon2', async () => {
    const api = {
      ArgonType: { Argon2id: 2 },
      hash: vi.fn(),
      verify: vi.fn(),
    };
    vi.doMock('./vendor/argon2.wasm', () => ({
      default: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer,
    }));
    vi.doMock('./vendor/argon2-bundled.js', () => ({ default: api }));

    const { loadWorkerArgon2 } = await import('./argon2-worker-runtime.js');
    await expect(loadWorkerArgon2()).resolves.toBe(api);
    const moduleConfig = Reflect.get(globalThis, 'Module') as {
      instantiateWasm: (
        imports: WebAssembly.Imports,
        receive: (instance: WebAssembly.Instance) => void,
      ) => Record<string, never>;
    };
    expect(moduleConfig.instantiateWasm).toEqual(expect.any(Function));
    const receiveInstance = vi.fn();
    expect(moduleConfig.instantiateWasm({}, receiveInstance)).toEqual({});
    await vi.waitFor(() => expect(receiveInstance).toHaveBeenCalledOnce());
  });

  it('falla cerrado cuando el bundle no expone una API Argon2', async () => {
    vi.doMock('./vendor/argon2.wasm', () => ({ default: new ArrayBuffer(0) }));
    vi.doMock('./vendor/argon2-bundled.js', () => ({ default: undefined, argon2: undefined }));

    const { loadWorkerArgon2 } = await import('./argon2-worker-runtime.js');
    await expect(loadWorkerArgon2()).rejects.toThrow('ARGON2_WORKER_MODULE_UNAVAILABLE');
  });
});
