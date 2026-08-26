/**
 * CORS fail-closed para rutas públicas del worker (M6B).
 * Solo los orígenes de ALLOWED_ORIGINS (separados por coma; '*' explícito
 * habilita cualquiera). Sin configuración → sin header CORS (mismo origen).
 */

export interface PublicCorsEnv {
  readonly ALLOWED_ORIGINS?: string;
}

/** Métodos que el POS y el marketing usan cross-origin (no solo POST). */
export const CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const CORS_ALLOW_HEADERS =
  'content-type, authorization, x-tenant-id, x-terminal-id, x-terminal-session-id, x-step-up-token, x-platform-staff-token';

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
): Record<string, string> {
  const allowed = (env?.ALLOWED_ORIGINS ?? '').trim();
  if (!allowed || !requestOrigin) return {};
  if (allowed === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
      'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
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
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    // El POS usa credentials: 'include' (cookies de sesión) — con origen
    // específico (no wildcard) el navegador exige esta cabecera.
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}
