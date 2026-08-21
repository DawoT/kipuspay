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
 * Clases de fallo estables de la verificación de firma Stripe (SEC-08 / US-02,
 * acceptance US-06): cada rechazo lleva un `error.code` estable por clase —
 * jamás un boolean colapsado ni un 401/400 genérico sin code. El cliente puede
 * clasificar el fallo sin depender del mensaje:
 *  - MISSING_HEADER      header `Stripe-Signature` o secret ausentes/vacíos, o
 *                        header presente pero sin los campos requeridos t=/v1=
 *  - TIMESTAMP_EXPIRED   age > ventana anti-replay (300 s, SEC-08)
 *  - TIMESTAMP_FUTURE    age < 0 (timestamp en el futuro)
 *  - INVALID_SIGNATURE   timestamp no entero, v1 no-hex, HMAC que no coincide,
 *                        o fallo criptográfico (fail-closed, Invarian 6)
 */
export type StripeSignatureFailureCode =
  'MISSING_HEADER' | 'TIMESTAMP_EXPIRED' | 'TIMESTAMP_FUTURE' | 'INVALID_SIGNATURE';

export type StripeSignatureVerifyResult =
  { ok: true } | { ok: false; code: StripeSignatureFailureCode };

/**
 * Valida firma Stripe HMAC-SHA256 con ventana anti-replay 0..300 s (SEC-08).
 * Devuelve un resultado discriminado con `error.code` estable por clase de
 * fallo (US-02 / US-06): no existe rechazo "opaco" — cada fallo se clasifica.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<StripeSignatureVerifyResult> {
  if (!signatureHeader || !secret) {
    return { ok: false, code: 'MISSING_HEADER' };
  }
  try {
    const parts = parseStripeSignatureHeader(signatureHeader);
    const timestamp = parts.timestamp;
    const stripeSigs = parts.v1;
    if (!timestamp || stripeSigs.length === 0) {
      return { ok: false, code: 'MISSING_HEADER' };
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isInteger(timestampSeconds)) {
      return { ok: false, code: 'INVALID_SIGNATURE' };
    }
    const ageSeconds = Math.floor(nowMs / 1000) - timestampSeconds;
    if (ageSeconds < 0) return { ok: false, code: 'TIMESTAMP_FUTURE' };
    if (ageSeconds > REPLAY_WINDOW_SECONDS) return { ok: false, code: 'TIMESTAMP_EXPIRED' };

    const computedSig = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    const expected = decodeHex(computedSig);
    if (!expected) return { ok: false, code: 'INVALID_SIGNATURE' };

    for (const stripeSig of stripeSigs) {
      const received = decodeHex(stripeSig);
      if (!received) continue;
      if (bytesEqualConstantTime(expected, received)) return { ok: true };
    }
    return { ok: false, code: 'INVALID_SIGNATURE' };
  } catch {
    // Fail-closed (Invarian 6): sin verificación criptográfica confirmada →
    // rechazo clasificado; nunca acceso por omisión.
    return { ok: false, code: 'INVALID_SIGNATURE' };
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
