/**
 * Sprint 49 — router de intención (Arquitectura §5.3 regla 33).
 * El LLM ligero clasifica la pregunta; el dominio VALIDA la salida contra la
 * whitelist. Todo lo que no esté en la whitelist es UNSUPPORTED (fail-closed):
 * el LLM jamás ejecuta una acción nueva.
 */

export const INTENT_ACTIONS = [
  'SALES_SUMMARY',
  'BREAKAGE',
  'CASH_EXCEPTIONS',
  'TOP_PRODUCTS',
  'AGING',
] as const;

export type InsightIntent = (typeof INTENT_ACTIONS)[number] | 'UNSUPPORTED';

const CANONICAL: Readonly<Record<string, InsightIntent>> = {
  sales_summary: 'SALES_SUMMARY',
  breakage: 'BREAKAGE',
  cash_exceptions: 'CASH_EXCEPTIONS',
  top_products: 'TOP_PRODUCTS',
  aging: 'AGING',
};

/** Normaliza y valida la acción clasificada por el LLM. Fuera de whitelist → UNSUPPORTED. */
export function classifyIntent(raw: string | null | undefined): InsightIntent {
  if (typeof raw !== 'string') return 'UNSUPPORTED';
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
  const canonical = CANONICAL[normalized];
  if (!canonical) return 'UNSUPPORTED';
  if (normalized.includes('drop') || normalized.includes('delete')) return 'UNSUPPORTED';
  return canonical;
}
