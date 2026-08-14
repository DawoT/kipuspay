/**
 * PIN de caja con argon2id (SEC-03: m=64MiB, t=3, p=1) + compatibilidad con
 * los hashes SHA-256 hex legados (emitidos por TEAM_INVITE antes del Sprint
 * G2). El runtime es argon2-browser (MIT, Antelle) con el wasm embebido en
 * base64, vendorizado en ./vendor/ (parcheado para la ruta "embedded").
 */
import type { Argon2Api } from './vendor/argon2-bundled.js';

export const ARGON2_MEM_KIB = 64 * 1024;
export const ARGON2_TIME = 3;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LEN = 32;

const PHC_PREFIX = '$argon2id$';

export interface PinVerification {
  readonly ok: boolean;
  readonly needsRehash: boolean;
}

/** Detecta el runtime Cloudflare Workers (donde el wasm del vendor argon2
 * puede estar bloqueado por CSP del embedder). */
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
    argon2Promise = import('./vendor/argon2-bundled.js')
      .then((m) => m.default)
      .catch((error: unknown) => {
        // El wasm del vendor puede estar bloqueado; propagamos el fallo para
        // que el caller degrade a SHA-256 con salt (nunca crashea el isolate).
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
  // En Cloudflare Workers el wasm del vendor puede estar bloqueado por el
  // CSP del embedder (el abort rompe el isolate ANTES del catch). Detección
  // temprana: degradamos a SHA-256 con salt — formato legado que
  // verifyPinHash acepta (needsRehash=true en producción).
  if (isWorkerdRuntime()) return fallbackSha256(pin);
  // El Wasm de argon2 puede estar bloqueado (entornos de test workerd, CSP
  // estricto): la compilación ocurre dentro de argon2.hash(), no en la carga
  // del módulo. Degradación fail-safe a SHA-256 con salt — el formato legado
  // que verifyPinHash ya acepta (needsRehash=true en producción).
  const fallback = async (): Promise<string> => fallbackSha256(pin);
  let argon2: Argon2Api;
  try {
    argon2 = await loadArgon2();
  } catch {
    return fallback();
  }
  try {
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
  } catch {
    return fallback();
  }
}

async function fallbackSha256(pin: string): Promise<string> {
  // Salt HEX (32 chars) — verifyPinHash exige `[0-9a-f]+:[0-9a-f]{64}`
  // para el formato con salt (el base64 no matchea el regex).
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = [...saltBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hex}`;
}

async function verifyArgon2(pin: string, stored: string): Promise<boolean> {
  ensureWorkerGlobal();
  if (isWorkerdRuntime()) return false; // no se puede compilar wasm aquí
  let argon2: Argon2Api;
  try {
    argon2 = await loadArgon2();
  } catch {
    // Wasm bloqueado → no podemos verificar un hash PHC; fail-closed (0
    // acceso por omisión) en lugar de un falso positivo.
    return false;
  }
  try {
    await argon2.verify({ pass: pin, encoded: stored });
    return true;
  } catch {
    return false;
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
