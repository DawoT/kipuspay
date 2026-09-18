/**
 * PIN de caja con argon2id (SEC-03: m=64MiB, t=3, p=1) + compatibilidad con
 * los hashes SHA-256 hex legados (emitidos por TEAM_INVITE antes del Sprint
 * G2). El runtime es argon2-browser (MIT, Antelle), vendorizado en ./vendor/;
 * Workers usa el mismo WASM como módulo estático para evitar compilación dinámica.
 */
import type { Argon2Api } from './vendor/argon2-bundled.js';

export const ARGON2_MEM_KIB = 64 * 1024;
export const ARGON2_TIME = 3;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LEN = 32;

const PHC_PREFIX = '$argon2id$';

function isWorkerdRuntime(): boolean {
  try {
    const g = globalThis as unknown as { navigator?: { userAgent?: string } };
    return (
      typeof g.navigator?.userAgent === 'string' && g.navigator.userAgent.includes('Cloudflare')
    );
  } catch {
    return false;
  }
}

export interface PinVerification {
  readonly ok: boolean;
  readonly needsRehash: boolean;
}

function ensureWorkerGlobal(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.self === 'undefined' || g.self === g) {
    Object.defineProperty(g, 'self', { value: {}, configurable: true });
  }
}

let argon2Promise: Promise<Argon2Api> | null = null;

function loadArgon2(): Promise<Argon2Api> {
  ensureWorkerGlobal();
  if (!argon2Promise) {
    argon2Promise = (
      isWorkerdRuntime()
        ? import('./argon2-worker-runtime.js').then((runtime) => runtime.loadWorkerArgon2())
        : import('./vendor/argon2-bundled.js').then((m) => m.default)
    ).catch((error: unknown) => {
      // No degradar hashes nuevos a SHA-256: sin Argon2 disponible, el
      // enrolamiento debe fallar explícitamente.
      argon2Promise = null;
      throw error;
    });
  }
  return argon2Promise;
}

function randomSaltBase64(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function hashPinArgon2id(
  pin: string,
  opts: { mem?: number; time?: number; parallelism?: number } = {},
): Promise<string> {
  ensureWorkerGlobal();
  const argon2 = await loadArgon2();
  const result = await argon2.hash({
    pass: pin,
    salt: randomSaltBase64(),
    time: opts.time ?? ARGON2_TIME,
    mem: opts.mem ?? ARGON2_MEM_KIB,
    parallelism: opts.parallelism ?? ARGON2_PARALLELISM,
    hashLen: ARGON2_HASH_LEN,
    type: argon2.ArgonType.Argon2id,
  });
  return result.encoded;
}

async function verifyArgon2(pin: string, stored: string): Promise<boolean> {
  ensureWorkerGlobal();
  const argon2: Argon2Api = await loadArgon2();
  try {
    await argon2.verify({ pass: pin, encoded: stored });
    return true;
  } catch (error) {
    // argon2-browser surfaces a password mismatch as this Argon2-specific
    // message. Other errors (WASM/runtime/memory failures) must not be counted
    // as a bad credential by the caller.
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
    if (
      message.includes('The password does not match the supplied hash') ||
      message === 'Decoding failed'
    ) {
      return false;
    }
    throw error;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPinHash(pin: string, stored: string): Promise<PinVerification> {
  if (stored.startsWith(PHC_PREFIX)) {
    return { ok: await verifyArgon2(pin, stored), needsRehash: false };
  }
  // Legado: sha256 hex pelado (`sha256(pin)`) o con salt (`salt:sha256(salt:pin)`,
  // emitido por hashPin antes del Sprint G2).
  const salted = /^([0-9a-fA-F]+):([0-9a-fA-F]{64})$/.exec(stored);
  const salt = salted?.[1];
  const storedSha = salted?.[2];
  if (salt && storedSha) {
    const pinHash = await sha256Hex(`${salt}:${pin}`);
    return { ok: constantTimeEqual(pinHash, storedSha), needsRehash: true };
  }
  const pinHash = await sha256Hex(pin);
  return { ok: constantTimeEqual(pinHash, stored), needsRehash: true };
}

export function isArgon2idHash(stored: string | null | undefined): boolean {
  return Boolean(stored?.startsWith(PHC_PREFIX));
}
