/**
 * Soft-launch flag. Default off.
 * Leido via $env/static/public: Vite lo resuelve una sola vez desde el ambiente
 * (process.env tiene prioridad sobre .env) e inlinea el MISMO valor en server y
 * cliente — cero divergencia de hidratacion. Preview local: activar el flag
 * PUBLIC_FEATURE_MARKETING_SITE a "1" en .env o en el shell, y reiniciar vite.
 */

import { PUBLIC_FEATURE_MARKETING_SITE } from '$env/static/public';

function flagOn(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function isMarketingSiteEnabled(): boolean {
  return flagOn(PUBLIC_FEATURE_MARKETING_SITE);
}
