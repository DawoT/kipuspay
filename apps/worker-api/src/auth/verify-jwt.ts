import type { VerifiedJwtClaims } from './tenant-auth-middleware.js';

export interface JwtVerifyEnv {
  /** Secret HS256 (Workers Secret). Prohibido hardcodear. */
  readonly AUTH_JWT_HS_SECRET?: string;
  /** Si está definido, solo RS/ES vía JWKS; HS queda denegado (SEC-01). */
  readonly AUTH_JWT_JWKS_URL?: string;
}

const textEncoder = new TextEncoder();

function b64urlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJsonPart(part: string): Record<string, unknown> | null {
  try {
    const json = new TextDecoder().decode(b64urlToBytes(part));
    const value: unknown = JSON.parse(json);
    if (typeof value !== 'object' || value === null) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function claimString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function claimNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function splitJwt(token: string): [string, string, string] | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;
  return [h, p, s];
}

function timeClaimsOk(payload: Record<string, unknown>, nowMs: number): boolean {
  const nowSec = Math.floor(nowMs / 1000);
  const exp = claimNumber(payload, 'exp');
  const nbf = claimNumber(payload, 'nbf');
  const iat = claimNumber(payload, 'iat');
  if (exp !== null && nowSec >= exp) return false;
  if (nbf !== null && nowSec < nbf) return false;
  if (iat !== null && iat > nowSec + 60) return false;
  return true;
}

function identityClaims(payload: Record<string, unknown>): VerifiedJwtClaims | null {
  const tenantId = claimString(payload, 'tenantId') ?? claimString(payload, 'tenant_id');
  const sub = claimString(payload, 'sub') ?? claimString(payload, 'externalAuthId');
  if (!tenantId || !sub) return null;
  const authTime = claimNumber(payload, 'auth_time');
  return { tenantId, sub, ...(authTime === null ? {} : { authTime }) };
}

async function verifyHs256(
  secret: string,
  headerB64: string,
  payloadB64: string,
  sigB64: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    b64urlToBytes(sigB64),
    textEncoder.encode(`${headerB64}.${payloadB64}`),
  );
}

/**
 * Verifica JWT (SEC-01): denylist alg=none; HS solo sin JWKS; exp/iat/nbf.
 * Identidad solo desde claims verificados (tenantId + sub).
 */
export async function verifyJwt(
  env: JwtVerifyEnv,
  token: string,
  nowMs: number = Date.now(),
): Promise<VerifiedJwtClaims | null> {
  const split = splitJwt(token);
  if (!split) return null;
  const [headerB64, payloadB64, sigB64] = split;
  const header = parseJsonPart(headerB64);
  const payload = parseJsonPart(payloadB64);
  if (!header || !payload) return null;

  const alg = claimString(header, 'alg');
  if (!alg || alg.toLowerCase() === 'none') return null;

  if (env.AUTH_JWT_JWKS_URL) {
    if (alg.startsWith('HS')) return null;
    return null;
  }

  if (alg !== 'HS256' || !env.AUTH_JWT_HS_SECRET) return null;
  const ok = await verifyHs256(env.AUTH_JWT_HS_SECRET, headerB64, payloadB64, sigB64);
  if (!ok || !timeClaimsOk(payload, nowMs)) return null;
  return identityClaims(payload);
}

/** Solo tests: firma HS256 con WebCrypto (no usar en producción para mint). */
export async function signHs256ForTests(
  secret: string,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): Promise<string> {
  const enc = (obj: Record<string, unknown>) =>
    bytesToB64url(textEncoder.encode(JSON.stringify(obj)));
  const headerB64 = enc(header);
  const payloadB64 = enc(claims);
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(`${headerB64}.${payloadB64}`),
  );
  return `${headerB64}.${payloadB64}.${bytesToB64url(new Uint8Array(sig))}`;
}
