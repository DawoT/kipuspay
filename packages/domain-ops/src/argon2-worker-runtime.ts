import './vendor/wasm.d.ts';

import wasmModule from './vendor/argon2.wasm';
import type { Argon2Api } from './vendor/argon2-bundled.js';

interface ArgonModuleConfig {
  instantiateWasm(
    imports: WebAssembly.Imports,
    receiveInstance: (instance: WebAssembly.Instance) => void,
  ): Record<string, never>;
}

/** Load Argon2 through a build-time compiled WASM module (Workers forbid compiling buffers). */
export async function loadWorkerArgon2(): Promise<Argon2Api> {
  const scope: object = typeof self !== 'undefined' ? self : globalThis;
  const config: ArgonModuleConfig = {
    instantiateWasm(imports, receiveInstance) {
      void WebAssembly.instantiate(wasmModule, imports).then(receiveInstance);
      return {};
    },
  };
  Reflect.set(scope, 'Module', config);
  const module = (await import('./vendor/argon2-bundled.js')) as unknown as Record<string, unknown>;
  const runtimeGlobals = globalThis as unknown as Record<string, unknown>;
  const commonJsExports = runtimeGlobals.exports as Record<string, unknown> | undefined;
  const api = module.default ?? module.argon2 ?? commonJsExports?.argon2 ?? runtimeGlobals.argon2;
  if (!api || typeof api !== 'object') {
    throw new Error('ARGON2_WORKER_MODULE_UNAVAILABLE');
  }
  return api as Argon2Api;
}
