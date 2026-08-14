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
  if (!origins.includes(requestOrigin)) return {};
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
