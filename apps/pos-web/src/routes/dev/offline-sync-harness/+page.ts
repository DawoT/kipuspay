/**
 * S5 (Sprint 7): el harness de sync offline es una herramienta de desarrollo.
 * Sin PUBLIC_ENABLE_DEV_HARNESS=1 responde 404 (nunca visible en producción).
 */
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';

const enabled = env.PUBLIC_ENABLE_DEV_HARNESS === '1' || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';

export function load(): Record<string, never> {
  if (!enabled) {
    // error() de SvelteKit aborta el load (never); no usar throw (only-throw-error).
    error(404, 'Not Found');
  }
  return {};
}
