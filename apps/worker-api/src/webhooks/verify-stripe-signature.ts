/**
 * Verificación Stripe webhook (Arquitectura §4 / SEC-08 / AGENTS invariante 6).
 * WebCrypto nativo — sin SDK npm.
 */

const REPLAY_WINDOW_SECONDS = 300;

/**
 * Motivos estables de rechazo (fail-closed, SEC-08 / AGENTS invariante 6):
 * códigos máquina-legibles para telemetría y consumo del handler, no texto libre.
 *  - missing-signature: header ausente/vacío o sin `t` ni `v1` parseables.
 *  - missing-secret:    STRIPE_WEBHOOK_SECRET no configurado (fail-closed).
 *  - stale-timestamp:   age > 300 s o age < 0 (replay/clock skew).
 *  - invalid-signature: HMAC no coincide o material hexadecimal inválido.
 */
export type StripeVerificationReason =
  | 'missing-signature'
  | 'missing-secret'
  | 'stale-timestamp'
  | 'invalid-signature';

export type StripeSignatureVerification =
  | { ok: true }
  | { ok: false; reason: StripeVerificationReason };

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
 * Valida firma Stripe HMAC-SHA256 con ventana anti-replay 0..300 s (SEC-08).
 * Devuelve un veredicto discriminado: `{ ok: true }` o `{ ok: false, reason }`
 * con motivo estable máquina-legible (missing-signature / missing-secret /
 * stale-timestamp / invalid-signature) — nunca un boolean mudo.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<StripeSignatureVerification> {
  try {
    if (!signatureHeader) return { ok: false, reason: 'missing-signature' };
    if (!secret) return { ok: false, reason: 'missing-secret' };
    const parts = parseStripeSignatureHeader(signatureHeader);
    const timestamp = parts.timestamp;
    const stripeSigs = parts.v1;
    if (!timestamp || stripeSigs.length === 0) {
      return { ok: false, reason: 'missing-signature' };
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isInteger(timestampSeconds)) {
      return { ok: false, reason: 'invalid-signature' };
    }
    const ageSeconds = Math.floor(nowMs / 1000) - timestampSeconds;
    if (ageSeconds > REPLAY_WINDOW_SECONDS || ageSeconds < 0) {
      return { ok: false, reason: 'stale-timestamp' };
    }

    const computedSig = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    const expected = decodeHex(computedSig);
    if (!expected) return { ok: false, reason: 'invalid-signature' };

    let valid = 0;
    for (const stripeSig of stripeSigs) {
      const received = decodeHex(stripeSig);
      if (!received) continue;
      valid |= bytesEqualConstantTime(expected, received) ? 1 : 0;
    }
    if (valid === 1) return { ok: true };
    return { ok: false, reason: 'invalid-signature' };
  } catch {
    return { ok: false, reason: 'invalid-signature' };
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
