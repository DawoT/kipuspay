/**
 * Verificación Stripe webhook (Arquitectura §4 / SEC-08 / AGENTS invariante 6).
 * WebCrypto nativo — sin SDK npm.
 */

const REPLAY_WINDOW_SECONDS = 300;

/**
 * Límite duro de tamaño de body de webhook (Invarian 6 / SEC-08): cualquier
 * payload >1MB se rechaza con 413/PAYLOAD_TOO_LARGE ANTES de verificar la
 * firma HMAC o hacer JSON.parse — guard anti-DoS y contra trabajo
 * criptográfico/de parseo innecesario. Stripe no envía eventos de este tamaño.
 */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/** Longitud del body crudo en bytes UTF-8 (no code units UTF-16). */
export function webhookBodyBytes(rawBody: string): number {
  return new TextEncoder().encode(rawBody).length;
}

function decodeHex(value: string): Uint8Array | null {
  if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function parseStripeSignatureHeader(signatureHeader: string): {
  timestamp?: string;
  v1: string[];
} {
  return signatureHeader.split(',').reduce(
    (acc: { timestamp?: string; v1: string[] }, item) => {
      const eq = item.indexOf('=');
      if (eq < 0) return acc;
      const key = item.slice(0, eq).trim();
      const val = item.slice(eq + 1).trim();
      if (key === 't' && val) acc.timestamp = val;
      if (key === 'v1' && val) acc.v1.push(val);
      return acc;
    },
    { v1: [] },
  );
}

function bytesEqualConstantTime(expected: Uint8Array, received: Uint8Array): boolean {
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i]! ^ received[i]!;
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Clases de fallo estables de la verificación de firma Stripe (SEC-08).
 * Cada clase tiene un `code` estable por `error.code` del webhook (US-02):
 * el cliente puede clasificar el fallo sin depender de mensajes ni de un 401
 * genérico único.
 */
export type StripeSignatureFailureCode =
  | 'STRIPE_SIG_MISSING_CREDENTIALS' // header o secret ausente
  | 'STRIPE_SIG_HEADER_MALFORMED' // falta t= o v1= en el header
  | 'STRIPE_SIG_TIMESTAMP_INVALID' // t no es un entero
  | 'STRIPE_SIG_FUTURE_TIMESTAMP' // age < 0 (timestamp en el futuro)
  | 'STRIPE_SIG_EXPIRED' // age > ventana anti-replay (300 s)
  | 'STRIPE_SIG_MALFORMED' // v1 no es hex válido (ninguna firma usable)
  | 'STRIPE_SIG_MISMATCH' // hex válido pero HMAC no coincide
  | 'STRIPE_SIG_CRYPTO_UNAVAILABLE'; // fallo criptográfico (catch)

export type StripeSignatureVerifyResult =
  | { ok: true }
  | { ok: false; code: StripeSignatureFailureCode };

/**
 * Valida firma Stripe HMAC-SHA256 con ventana anti-replay 0..300 s (SEC-08).
 * Devuelve un resultado discriminado con `code` estable por clase de fallo
 * (US-02): jamás un boolean colapsado — cada rechazo se clasifica.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<StripeSignatureVerifyResult> {
  if (!signatureHeader || !secret) {
    return { ok: false, code: 'STRIPE_SIG_MISSING_CREDENTIALS' };
  }
  try {
    const parts = parseStripeSignatureHeader(signatureHeader);
    const timestamp = parts.timestamp;
    const stripeSigs = parts.v1;
    if (!timestamp || stripeSigs.length === 0) {
      return { ok: false, code: 'STRIPE_SIG_HEADER_MALFORMED' };
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isInteger(timestampSeconds)) {
      return { ok: false, code: 'STRIPE_SIG_TIMESTAMP_INVALID' };
    }
    const ageSeconds = Math.floor(nowMs / 1000) - timestampSeconds;
    if (ageSeconds < 0) return { ok: false, code: 'STRIPE_SIG_FUTURE_TIMESTAMP' };
    if (ageSeconds > REPLAY_WINDOW_SECONDS) return { ok: false, code: 'STRIPE_SIG_EXPIRED' };

    const computedSig = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    const expected = decodeHex(computedSig);
    if (!expected) return { ok: false, code: 'STRIPE_SIG_CRYPTO_UNAVAILABLE' };

    let anyWellFormed = false;
    for (const stripeSig of stripeSigs) {
      const received = decodeHex(stripeSig);
      if (!received) continue;
      anyWellFormed = true;
      if (bytesEqualConstantTime(expected, received)) return { ok: true };
    }
    return anyWellFormed
      ? { ok: false, code: 'STRIPE_SIG_MISMATCH' }
      : { ok: false, code: 'STRIPE_SIG_MALFORMED' };
  } catch {
    return { ok: false, code: 'STRIPE_SIG_CRYPTO_UNAVAILABLE' };
  }
}

/** Solo tests: mint header Stripe-compatible. */
export async function signStripeWebhookForTests(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): Promise<string> {
  const sig = await hmacSha256Hex(secret, `${timestampSeconds}.${rawBody}`);
  return `t=${timestampSeconds},v1=${sig}`;
}