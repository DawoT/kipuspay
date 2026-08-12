/**
 * Soft-launch flag. Default off.
 * Leido via $env/dynamic/public: la lectura ocurre en cada acceso, asi el flag
 * puede cambiarse por entorno (wrangler vars o process.env) sin regenerar
 * tipos. Preview local: activar el flag PUBLIC_FEATURE_MARKETING_SITE a "1"
 * en .env o en el shell, y reiniciar vite.
 */

import { env } from '$env/dynamic/public';

function flagOn(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function isMarketingSiteEnabled(): boolean {
  return flagOn(env.PUBLIC_FEATURE_MARKETING_SITE);
}
