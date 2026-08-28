/**
 * CORS fail-closed para rutas públicas del worker (M6B).
 * Solo los orígenes de ALLOWED_ORIGINS (separados por coma; '*' explícito
 * habilita cualquiera). Sin configuración → sin header CORS (mismo origen).
 */

export interface PublicCorsEnv {
  readonly ALLOWED_ORIGINS?: string;
  readonly ALLOWED_PLATFORM_ORIGINS?: string;
}

/** Métodos que el POS y el marketing usan cross-origin (no solo POST). */
export const CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
/** Headers públicos (sin token de plataforma) — defensa en profundidad: x-platform-staff-token solo en /platform/* */
export const CORS_ALLOW_HEADERS_PUBLIC =
  'content-type, authorization, x-tenant-id, x-terminal-id, x-terminal-session-id, x-step-up-token';
export const CORS_ALLOW_HEADERS_PLATFORM =
  'content-type, authorization, x-tenant-id, x-terminal-id, x-terminal-session-id, x-step-up-token, x-platform-staff-token';
/** Compat: código legacy usa CORS_ALLOW_HEADERS como platform (incluye token) */
export const CORS_ALLOW_HEADERS = CORS_ALLOW_HEADERS_PLATFORM;

function originMatchesPattern(pattern: string, origin: string): boolean {
  if (pattern === origin) return true;
  if (pattern.startsWith('https://*.') && origin.startsWith('https://')) {
    const domain = pattern.slice(10);
    const hostname = origin.slice(8);
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }
  if (pattern.startsWith('http://localhost:') && origin.startsWith('http://localhost:')) {
    return true;
  }
  return false;
}

export function corsHeadersFor(
  env: PublicCorsEnv | undefined,
  requestOrigin: string | null,
  requestPath?: string,
): Record<string, string> {
  const isPlatform = typeof requestPath === 'string' && requestPath.startsWith('/platform/');
  const allowed = isPlatform
    ? (env?.ALLOWED_PLATFORM_ORIGINS ?? '').trim()
    : (env?.ALLOWED_ORIGINS ?? '').trim();
  const allowHeaders = isPlatform ? CORS_ALLOW_HEADERS_PLATFORM : CORS_ALLOW_HEADERS_PUBLIC;
  if (!allowed || !requestOrigin) return {};
  if (allowed === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
      'Access-Control-Allow-Headers': allowHeaders,
      Vary: 'Origin',
    };
  }
  const origins = allowed
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isAllowed = origins.some((pattern) => originMatchesPattern(pattern, requestOrigin));
  if (!isAllowed) return {};
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
    'Access-Control-Allow-Headers': allowHeaders,
    // El POS usa credentials: 'include' (cookies de sesión) — con origen
    // específico (no wildcard) el navegador exige esta cabecera.
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}
