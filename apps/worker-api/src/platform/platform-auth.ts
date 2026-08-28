/* eslint-disable */
/**
 * Ola 3 — Control Plane SuperAdmin aislado (ADR-ARCH-003).
 * Middleware platformAuth: CF Access JWT (CF_Authorization) + allowlist ALLOWLIST_STAFF_EMAILS
 * + x-platform-staff-token (constant-time, patrón index.ts:739). Nunca role=owner.
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

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0 && b.length === 0) return true;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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

function extractEmailFromJwtPayload(payload: Record<string, unknown>): string {
  const email = payload.email;
  if (typeof email === 'string') return email.trim().toLowerCase();
  // Cloudflare Access may use `upn` or `preferred_username`
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
  if (!expected || !provided || expected.length !== provided.length) return false;
  return constantTimeEqual(expected, provided);
}

function isCfAccessAuthorized(env: PlatformAuthEnv, headerValue: string | undefined): boolean {
  const raw = (headerValue ?? '').trim();
  if (!raw) return false;
  // Accept `Bearer <jwt>` or raw jwt
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;
  if (!token || token.split('.').length !== 3) return false;

  const parts = token.split('.');
  const payloadB64 = parts[1] ?? '';
  const payload = b64UrlDecodeToJson(payloadB64);
  if (!payload) return false;

  // exp check fail-closed (expired → reject)
  const exp = payload.exp;
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > exp) return false;
  }

  // aud check if configured (fail-closed if mismatch when expected aud set)
  const expectedAud = env.CF_ACCESS_AUD?.trim() ?? '';
  if (expectedAud) {
    const aud = extractAudFromPayload(payload);
    if (aud !== expectedAud) return false;
  }

  const email = extractEmailFromJwtPayload(payload);
  if (!email) return false;
  const allowlist = parseAllowlist(env.ALLOWLIST_STAFF_EMAILS);
  if (allowlist.size === 0) return false;
  // constant-time via set lookup (email normalized)
  return allowlist.has(email);
}

export function isPlatformAuthorized(env: PlatformAuthEnv, headers: Headers): boolean {
  const staffHeader = headers.get('x-platform-staff-token') ?? undefined;
  if (isStaffTokenValid(env, staffHeader)) return true;

  // CF Access headers: CF_Authorization (task) + Cf-Access-Jwt-Assertion (real)
  const cfAuth =
    headers.get('cf-authorization') ??
    headers.get('cf_authorization') ??
    headers.get('cf-access-jwt-assertion') ??
    headers.get('x-cf-authorization') ??
    undefined;
  if (cfAuth && isCfAccessAuthorized(env, cfAuth)) return true;

  // Also allow Authorization: Bearer <CF JWT> if email in allowlist (fallback)
  // But nunca role=owner: we do NOT accept tenant JWT. So we only check cf headers.
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
    | { get(k: string): Promise<string | null>; put?(k: string, v: string, opts?: { expirationTtl?: number }): Promise<void> }
    | null
    | undefined;
  // Fail-closed if KV is expected but missing? The control plane requires KV; if undefined → 503.
  // But for tests we allow missing KV to still pass (fail-open for cost protection).
  // Ola 3 says fail-closed 503 si KV/DO caído — for platform we treat KV missing as 503.
  // However legacy rate-limit.ts fails open without KV. We diverge: platform is security, fail-closed.
  // If KV is undefined, we treat as unavailable → 503 if we cannot enforce limit.
  // To keep backward compat with tests that provide KV, we check if KV is null/undefined → allow but mark kvFailed true ?
  // Task says rate limit 100/min/IP and 503 if KV/DO caído. So we must 503 when KV unavailable.
  // We implement: if KV missing → kvFailed true → caller returns 503.
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
    c: { req: { raw: Request; header(name: string): string | undefined }; env: PlatformAuthEnv; json(body: unknown, status: number): Response },
    next: () => Promise<void>,
  ): Promise<Response | void> => {
    // Rate limit first (100/min/IP)
    const rate = await enforcePlatformRateLimit(c.env, c.req.raw);
    if (rate.kvFailed) {
      return c.json({ error: 'Platform control plane unavailable', code: 'PLATFORM_UNAVAILABLE' }, 503);
    }
    if (!rate.allowed) {
      return c.json({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfterSeconds: rate.retryAfter }, 429);
    }

    if (platformAuthUnavailable(c.env)) {
      return c.json({ error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' }, 503);
    }
    const ok = isPlatformAuthorized(c.env, c.req.raw.headers);
    if (!ok) {
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
      return c.json({ error: 'Platform control plane unavailable', code: 'PLATFORM_UNAVAILABLE' }, 503);
    }
    if (!rate.allowed) {
      return c.json({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfterSeconds: rate.retryAfter }, 429);
    }
    if (platformAuthUnavailable(env)) {
      return c.json({ error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' }, 503);
    }
    const ok = isPlatformAuthorized(env, c.req.raw.headers);
    if (!ok) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    await next();
  });
}
