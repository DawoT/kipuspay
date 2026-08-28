/* eslint-disable */
/**
 * Ola 3 — Control Plane SuperAdmin aislado (ADR-ARCH-003).
 * Middleware platformAuth: CF Access JWT (Cf-Access-Jwt-Assertion) + allowlist ALLOWLIST_STAFF_EMAILS
 * + x-platform-staff-token (constant-time, timingSafeEqual). Nunca role=owner.
 * Zero-Trust: JWT verificado con JWK, iss/aud/kid, teamDomain. Fail-closed 503 si verificación no disponible.
 * Rate limit 100/min/IP (KV) + fail-closed 503 si KV/DO/DB caído.
 */
import { createMiddleware } from 'hono/factory';
import { enforceRateLimit, rateLimitKey, clientIp } from '../auth/rate-limit.js';
import type { WorkerEnv } from '../auth/control-plane.js';

export interface PlatformAuthEnv extends WorkerEnv {
  readonly ALLOWLIST_STAFF_EMAILS?: string;
  readonly CF_ACCESS_TEAM_DOMAIN?: string;
  readonly CF_ACCESS_AUD?: string;
}

// Zero-Trust: timingSafeEqual constant-time sobre Uint8Array sin early return por longitud
function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = new TextEncoder().encode(a);
  const bBuf = new TextEncoder().encode(b);
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const aPadded = new Uint8Array(maxLen);
  const bPadded = new Uint8Array(maxLen);
  aPadded.set(aBuf);
  bPadded.set(bBuf);
  // Incorpora diferencia de longitud sin early return — compara todo el buffer
  let diff = aBuf.length ^ bBuf.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= aPadded[i]! ^ bPadded[i]!;
  }
  return diff === 0;
}

function constantTimeEqual(a: string, b: string): boolean {
  // Mantener nombre para compat, pero delega a timingSafeEqual sin early return
  if (a.length === 0 && b.length === 0) return true;
  return timingSafeEqual(a, b);
}

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function b64UrlDecodeToJson(tokenPart: string): Record<string, unknown> | null {
  try {
    const padded = tokenPart.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function b64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extractEmailFromJwtPayload(payload: Record<string, unknown>): string {
  const email = payload.email;
  if (typeof email === 'string') return email.trim().toLowerCase();
  const upn = payload.upn;
  if (typeof upn === 'string') return upn.trim().toLowerCase();
  const pref = payload.preferred_username;
  if (typeof pref === 'string') return pref.trim().toLowerCase();
  return '';
}

function extractAudFromPayload(payload: Record<string, unknown>): string {
  const aud = payload.aud;
  if (typeof aud === 'string') return aud;
  if (Array.isArray(aud) && aud.length > 0 && typeof aud[0] === 'string') return aud[0] as string;
  return '';
}

function isStaffTokenValid(env: PlatformAuthEnv, header: string | undefined): boolean {
  const expected = env.PLATFORM_STAFF_TOKEN?.trim() ?? '';
  const provided = (header ?? '').trim();
  if (!expected || !provided) return false;
  // Zero-Trust: sin early return por longitud — timingSafeEqual sobre Uint8Array longitud fija
  return timingSafeEqual(expected, provided);
}

// JWK cache for CF Access certs (10m TTL)
type CfJwksCache = { keys: Map<string, JsonWebKey>; fetchedAt: number; teamDomain: string };
let cfJwksCache: CfJwksCache | null = null;
const CF_JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchCfCerts(teamDomain: string): Promise<Map<string, JsonWebKey> | null> {
  const now = Date.now();
  if (
    cfJwksCache &&
    cfJwksCache.teamDomain === teamDomain &&
    now - cfJwksCache.fetchedAt < CF_JWKS_TTL_MS
  ) {
    return cfJwksCache.keys;
  }
  const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: JsonWebKey[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) return null;
    const map = new Map<string, JsonWebKey>();
    for (const k of body.keys) {
      const kid = (k as unknown as { kid?: unknown }).kid;
      if (typeof kid === 'string' && kid) map.set(kid, k);
    }
    if (map.size === 0) return null;
    cfJwksCache = { keys: map, fetchedAt: now, teamDomain };
    return map;
  } catch {
    return null;
  }
}

export function _clearCfCacheForTests(): void {
  cfJwksCache = null;
}

async function isCfAccessAuthorized(
  env: PlatformAuthEnv,
  headerValue: string | undefined,
): Promise<{ authorized: boolean; unavailable?: boolean }> {
  // Zero-Trust: JWT verificado con JWK, iss/aud/kid, teamDomain
  const raw = (headerValue ?? '').trim();
  if (!raw) return { authorized: false };
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;
  if (!token || token.split('.').length !== 3) return { authorized: false };

  const parts = token.split('.');
  const headerB64 = parts[0] ?? '';
  const payloadB64 = parts[1] ?? '';
  const sigB64 = parts[2] ?? '';
  if (!headerB64 || !payloadB64 || !sigB64) return { authorized: false };

  const header = b64UrlDecodeToJson(headerB64);
  if (!header) return { authorized: false };

  const alg = typeof header.alg === 'string' ? header.alg : '';
  if (alg !== 'RS256') return { authorized: false };

  const kid = typeof header.kid === 'string' ? header.kid : '';
  if (!kid) return { authorized: false };

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim() ?? '';
  if (!teamDomain) {
    // fail-closed 503 STAFF_UNAVAILABLE (no 401) — verificación no disponible
    return { authorized: false, unavailable: true };
  }

  const certs = await fetchCfCerts(teamDomain);
  if (!certs) {
    return { authorized: false, unavailable: true };
  }
  const jwk = certs.get(kid);
  if (!jwk) return { authorized: false };

  const payload = b64UrlDecodeToJson(payloadB64);
  if (!payload) return { authorized: false };

  const exp = payload.exp;
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > exp) return { authorized: false };
  }

  const expectedAud = env.CF_ACCESS_AUD?.trim() ?? '';
  if (expectedAud) {
    const aud = extractAudFromPayload(payload);
    if (aud !== expectedAud) return { authorized: false };
  }

  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  const expectedIss = `https://${teamDomain}.cloudflareaccess.com`;
  if (iss !== expectedIss) return { authorized: false };

  // Verifica firma RS256 con JWK
  try {
    const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64UrlToBytes(sigB64);
    // valida que jwk sea RSA RS256 si declara alg
    const jwkAlg = (jwk as unknown as { alg?: unknown }).alg;
    if (typeof jwkAlg === 'string' && jwkAlg !== 'RS256') return { authorized: false };
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
    const imported = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    const valid = await crypto.subtle.verify(algorithm, imported, signature, message);
    if (!valid) return { authorized: false };
  } catch {
    return { authorized: false };
  }

  const email = extractEmailFromJwtPayload(payload);
  if (!email) return { authorized: false };
  const allowlist = parseAllowlist(env.ALLOWLIST_STAFF_EMAILS);
  if (allowlist.size === 0) return { authorized: false };
  return { authorized: allowlist.has(email) };
}

export async function isPlatformAuthorized(
  env: PlatformAuthEnv,
  headers: Headers,
): Promise<{ authorized: boolean; unavailable?: boolean }> {
  const staffHeader = headers.get('x-platform-staff-token') ?? undefined;
  if (isStaffTokenValid(env, staffHeader)) return { authorized: true };

  // Solo Cf-Access-Jwt-Assertion es insobornable (Cloudflare Access lo inyecta y el cliente no puede forjar)
  const cfAuth = headers.get('cf-access-jwt-assertion') ?? undefined;
  if (cfAuth) {
    const cf = await isCfAccessAuthorized(env, cfAuth);
    if (cf.unavailable) return { authorized: false, unavailable: true };
    if (cf.authorized) return { authorized: true };
  }

  return { authorized: false };
}

// Compat sync wrapper para tests legacy que esperan boolean (opcional)
export function isPlatformAuthorizedSync(env: PlatformAuthEnv, headers: Headers): boolean {
  // No usado en producción — solo para compat de tests que no await
  // Retorna false siempre si hay CF JWT (requiere async verify) — usar isPlatformAuthorized async
  const staffHeader = headers.get('x-platform-staff-token') ?? undefined;
  if (isStaffTokenValid(env, staffHeader)) return true;
  return false;
}

export function platformAuthUnavailable(env: PlatformAuthEnv): boolean {
  const hasStaff = Boolean(env.PLATFORM_STAFF_TOKEN?.trim());
  const hasAllowlist = Boolean(env.ALLOWLIST_STAFF_EMAILS?.trim());
  return !hasStaff && !hasAllowlist;
}

export async function enforcePlatformRateLimit(
  env: PlatformAuthEnv,
  request: Request,
): Promise<{ allowed: boolean; retryAfter: number; kvFailed: boolean }> {
  const kv = (env as { TENANT_KV?: unknown }).TENANT_KV as
    | {
        get(k: string): Promise<string | null>;
        put?(k: string, v: string, opts?: { expirationTtl?: number }): Promise<void>;
      }
    | null
    | undefined;
  if (!kv) {
    return { allowed: true, retryAfter: 0, kvFailed: true };
  }
  try {
    const ip = clientIp(request);
    const key = rateLimitKey(ip, 'platform');
    const { decision } = await enforceRateLimit({
      kv,
      key,
      limit: 100,
      windowSeconds: 60,
    });
    if (!decision.allowed) {
      return { allowed: false, retryAfter: decision.retryAfterSeconds, kvFailed: false };
    }
    return { allowed: true, retryAfter: 0, kvFailed: false };
  } catch {
    return { allowed: true, retryAfter: 0, kvFailed: true };
  }
}

export function createPlatformAuthMiddleware() {
  return async (
    c: {
      req: { raw: Request; header(name: string): string | undefined };
      env: PlatformAuthEnv;
      json(body: unknown, status: number): Response;
    },
    next: () => Promise<void>,
  ): Promise<Response | void> => {
    const rate = await enforcePlatformRateLimit(c.env, c.req.raw);
    if (rate.kvFailed) {
      return c.json(
        { error: 'Platform control plane unavailable', code: 'PLATFORM_UNAVAILABLE' },
        503,
      );
    }
    if (!rate.allowed) {
      return c.json(
        { error: 'Too many requests', code: 'RATE_LIMITED', retryAfterSeconds: rate.retryAfter },
        429,
      );
    }

    if (platformAuthUnavailable(c.env)) {
      return c.json({ error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' }, 503);
    }
    const auth = await isPlatformAuthorized(c.env, c.req.raw.headers);
    if (auth.unavailable) {
      return c.json({ error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' }, 503);
    }
    if (!auth.authorized) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    await next();
  };
}

export function createPlatformAuthMiddlewareHono() {
  return createMiddleware(async (c, next) => {
    const env = c.env as PlatformAuthEnv;
    const rate = await enforcePlatformRateLimit(env, c.req.raw);
    if (rate.kvFailed) {
      return c.json(
        { error: 'Platform control plane unavailable', code: 'PLATFORM_UNAVAILABLE' },
        503,
      );
    }
    if (!rate.allowed) {
      return c.json(
        { error: 'Too many requests', code: 'RATE_LIMITED', retryAfterSeconds: rate.retryAfter },
        429,
      );
    }
    if (platformAuthUnavailable(env)) {
      return c.json({ error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' }, 503);
    }
    const auth = await isPlatformAuthorized(env, c.req.raw.headers);
    if (auth.unavailable) {
      return c.json({ error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' }, 503);
    }
    if (!auth.authorized) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    await next();
  });
}
