/**
 * Clasificación de rutas para Plan Guard (Arquitectura §3 · GTM §4.1).
 * Cobro / caja / emisión nunca son "premium" → nunca HTTP 402 por plan.
 */

const CHECKOUT_CRITICAL_PREFIXES = [
  '/api/pos/',
  '/api/sales/',
  '/api/cash/',
  '/api/fiscal/emit',
  '/api/documents/emit',
  // Arqueo Arranque — nunca 402 por plan (GTM §4.1 / §9).
  '/api/reports/arqueo',
] as const;

const PREMIUM_PREFIXES = [
  '/api/owner/',
  '/api/reports/advanced',
  '/api/multi-register/',
  '/api/insights/',
  // Sprint 23 — API/export Cadena+ (no incluye catalog-import S21)
  '/api/integrations/accounting',
  '/api/integrations/api-keys',
  '/api/integrations/webhooks',
] as const;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix);
}

/** Rutas de cobro, caja o emisión: el Plan Guard no puede devolver 402. */
export function isCheckoutCriticalRoute(path: string): boolean {
  return CHECKOUT_CRITICAL_PREFIXES.some((p) => matchesPrefix(path, p));
}

/**
 * Features premium (Modo Dueño, multi-caja, reportes avanzados, insights).
 * Las rutas críticas de cobro nunca son premium.
 */
export function isPremiumFeatureRoute(path: string): boolean {
  if (isCheckoutCriticalRoute(path)) return false;
  return PREMIUM_PREFIXES.some((p) => matchesPrefix(path, p));
}
