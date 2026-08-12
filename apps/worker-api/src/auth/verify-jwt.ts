import type { VerifiedJwtClaims } from './tenant-auth-middleware.js';

export interface JwtVerifyEnv {
  /** Secret HS256 (Workers Secret). Prohibido hardcodear. */
  readonly AUTH_JWT_HS_SECRET?: string;
  /** Si está definido, solo RS/ES vía JWKS; HS queda denegado (SEC-01). */
  readonly AUTH_JWT_JWKS_URL?: string;
}

const textEncoder = new TextEncoder();

/** JWK del IdP (el lib webworker no tipa `kid`). */
interface JwkEntry extends JsonWebKey {
  readonly kid?: string;
}

/** Caché JWKS por isolate (TTL 5 min); fail-closed si no se puede renovar. */
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
let jwksCache: { keys: Map<string, JwkEntry>; fetchedAt: number } | null = null;

async function loadJwks(url: string): Promise<Map<string, JwkEntry> | null> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) return jwksCache.keys;
  let body: { keys?: JwkEntry[] };
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(body.keys)) return null;
  const keys = new Map<string, JwkEntry>();
  for (const key of body.keys) {
    const kid = typeof key.kid === 'string' && key.kid.length > 0 ? key.kid : null;
    const use = typeof key.use === 'string' ? key.use : null;
    if (kid && (use === null || use === 'sig')) keys.set(kid, key);
  }
  if (keys.size === 0) return null;
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function resolveJwksKey(
  jwks: ReadonlyMap<string, JwkEntry>,
  header: Record<string, unknown>,
  alg: string,
): JwkEntry | null {
  const kid = claimString(header, 'kid');
  if (kid) return jwks.get(kid) ?? null;
  if (jwks.size === 1) {
    const [only] = [...jwks.values()];
    return only && (!only.alg || only.alg === alg) ? only : null;
  }
  return null;
}

async function verifyAsymmetric(
  alg: string,
  key: JwkEntry,
  headerB64: string,
  payloadB64: string,
  sigB64: string,
): Promise<boolean> {
  if (key.alg && key.alg !== alg) return false;
  const message = textEncoder.encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToBytes(sigB64);
  try {
    if (alg === 'RS256' && key.kty === 'RSA') {
      const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
      const imported = await crypto.subtle.importKey('jwk', key, algorithm, false, ['verify']);
      return crypto.subtle.verify(algorithm, imported, signature, message);
    }
    if (alg === 'ES256' && key.kty === 'EC' && key.crv === 'P-256') {
      const algorithm = { name: 'ECDSA', hash: 'SHA-256' } as const;
      const imported = await crypto.subtle.importKey('jwk', key, algorithm, false, ['verify']);
      return crypto.subtle.verify(algorithm, imported, signature, message);
    }
    return false;
  } catch {
    return false;
  }
}

async function verifyViaJwks(
  env: JwtVerifyEnv,
  alg: string,
  header: Record<string, unknown>,
  headerB64: string,
  payloadB64: string,
  sigB64: string,
): Promise<boolean> {
  if (alg.startsWith('HS')) return false;
  const jwks = await loadJwks(env.AUTH_JWT_JWKS_URL!);
  if (!jwks) return false;
  const key = resolveJwksKey(jwks, header, alg);
  if (!key) return false;
  return verifyAsymmetric(alg, key, headerB64, payloadB64, sigB64);
}

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
    const ok = await verifyViaJwks(env, alg, header, headerB64, payloadB64, sigB64);
    if (!ok || !timeClaimsOk(payload, nowMs)) return null;
    return identityClaims(payload);
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
