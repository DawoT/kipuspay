import type { Handle } from '@sveltejs/kit';

/**
 * CSP del POS. connect-src incluye la base de la API (PUBLIC_API_BASE) para
 * que el claim de onboarding y las llamadas autenticadas funcionen también
 * cross-origin (arquitectura final con api.kipuspay.com).
 */
export function buildContentSecurityPolicy(apiBase: string): string {
  const normalized = apiBase.replace(/\/$/, '');
  const connectSources = ["'self'", 'https://fcmregistrations.googleapis.com', 'https://firebaseinstallations.googleapis.com'];
  if (normalized) {
    connectSources.push(normalized);
    const ws = normalized.replace(/^http/i, 'ws');
    if (ws !== normalized) connectSources.push(ws);
  }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    `connect-src ${connectSources.join(' ')}`,
  ].join('; ');
}

export const handle: Handle = async ({ event, resolve }) => {
  const apiBase = process.env.PUBLIC_API_BASE ?? '';
  const response = await resolve(event);
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(apiBase));
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Permissions-Policy', 'camera=(self), notifications=(self)');
  return response;
};
