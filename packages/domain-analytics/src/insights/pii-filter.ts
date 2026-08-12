/**
 * Sprint 49 — schema PII-free (Arquitectura §5.3 regla 33 / edge C, LPDP regla 32).
 * Post-check determinista sobre facts_json ANTES de la NLG: ninguna clave PII
 * (email/phone/address/document_number) puede estar presente, ni siquiera
 * anidada. La whitelist del SQL ya las excluye; esto es la segunda barrera.
 */

export const PII_BLOCKED_KEY = 'PII_BLOCKED';
export const PII_KEYS = new Set(['email', 'phone', 'address', 'document_number']);

export function assertNoPiiInFacts(facts: unknown, path = ''): void {
  if (Array.isArray(facts)) {
    for (const item of facts) assertNoPiiInFacts(item, path);
    return;
  }
  if (facts === null || typeof facts !== 'object') return;
  for (const [key, value] of Object.entries(facts as Record<string, unknown>)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      throw new Error(PII_BLOCKED_KEY);
    }
    if (value !== null && typeof value === 'object') {
      assertNoPiiInFacts(value, `${path}.${key}`);
    }
  }
}
