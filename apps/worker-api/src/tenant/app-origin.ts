/**
 * Origen del POS para return URLs de Stripe (D0).
 * Mientras no hay dominio comprado el canónico temporal es pages.dev.
 * No usar app.kipuspay.com como default: ese host no existe hasta DM.
 */

export interface AppOriginEnv {
  readonly POS_APP_ORIGIN?: string;
  readonly ALLOWED_ORIGINS?: string;
}

export function resolvePosAppOrigin(env: AppOriginEnv | undefined): string {
  const explicit = env?.POS_APP_ORIGIN?.trim().replace(/\/$/, '') ?? '';
  if (explicit.startsWith('https://')) return explicit;
  const origins = (env?.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.startsWith('https://'));
  const pagesPos = origins.find(
    (origin) => origin.includes('pos-web') && origin.includes('pages.dev'),
  );
  if (pagesPos) return pagesPos;
  const anyPages = origins.find((origin) => origin.includes('pages.dev'));
  if (anyPages) return anyPages;
  return '';
}

export function configuracionUrl(env: AppOriginEnv | undefined, query = ''): string {
  const origin = resolvePosAppOrigin(env);
  if (!origin) return '';
  return `${origin}/admin/configuracion${query}`;
}

export function httpsReturnOrEmpty(requested: string | undefined, fallback: string): string {
  const raw = requested?.trim() ?? '';
  if (!raw) return fallback.startsWith('https://') ? fallback : '';
  if (raw.startsWith('https://')) return raw;
  return '';
}
