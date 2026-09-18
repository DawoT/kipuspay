import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const vendorUrl = new URL('../packages/domain-ops/src/vendor/argon2-bundled.js', import.meta.url);
const wasmUrl = new URL('../packages/domain-ops/src/vendor/argon2.wasm', import.meta.url);
const source = await readFile(vendorUrl, 'utf8');
const embeddedWasm = /721:function\(A,I\)\{A\.exports="([A-Za-z0-9+/=]+)"\}/.exec(source)?.[1];

if (!embeddedWasm) throw new Error('Could not locate the embedded Argon2 WASM module.');

const globalReceiver = '}(globalThis,(function';
let workerSafeVendor = source.includes(globalReceiver)
  ? source
  : source.replace('}(this,(function', globalReceiver);
if (!workerSafeVendor.includes(globalReceiver)) {
  throw new Error('Could not locate the Argon2 UMD global receiver.');
}
const moduleInit = 'A.Module={wasmBinary:I,wasmMemory:g,postRun(){B(A.Module)}}';
const workerModuleInit =
  'A.Module={wasmBinary:I,wasmMemory:g,instantiateWasm:A.Module&&A.Module.instantiateWasm,postRun(){B(A.Module)}}';
if (workerSafeVendor.includes(moduleInit)) {
  workerSafeVendor = workerSafeVendor.replace(moduleInit, workerModuleInit);
} else if (!workerSafeVendor.includes(workerModuleInit)) {
  throw new Error('Could not locate the Argon2 WASM module initialization hook.');
}

await writeFile(vendorUrl, workerSafeVendor);
await writeFile(fileURLToPath(wasmUrl), Buffer.from(embeddedWasm, 'base64'));
