/**
 * Sprint 49 — post-check determinista anti-alucinación (Arquitectura §5.3 regla 33).
 *
 * Los números se computan en D1 y se inyectan como hechos tipados; el LLM solo
 * redacta prosa conectándolos VERBATIM. Este guard rechaza la respuesta si:
 * 1) un hecho numérico no aparece en el texto, o
 * 2) el texto contiene una cifra (≥4 dígitos, formato de monto) ajena a los hechos.
 */

export const NLG_CONTRADICTION_KEY = 'NLG_CONTRADICTION';

export interface InsightFact {
  readonly key: string;
  readonly value: number | string;
}

function factTokens(facts: readonly InsightFact[]): Set<string> {
  const tokens = new Set<string>();
  for (const fact of facts) {
    if (typeof fact.value === 'number') {
      tokens.add(String(fact.value));
    } else {
      tokens.add(fact.value);
    }
  }
  return tokens;
}

/** Cifras candidatas a monto en el texto (enteros de ≥4 dígitos, sin separadores). */
function candidateNumbers(text: string): string[] {
  return [...text.matchAll(/\d{4,}/g)].map((match) => match[0]);
}

export function assertFactsVerbatim(facts: readonly InsightFact[], text: string): void {
  const tokens = factTokens(facts);
  for (const fact of facts) {
    if (typeof fact.value === 'number' && fact.value > 0 && !text.includes(String(fact.value))) {
      throw new Error(NLG_CONTRADICTION_KEY);
    }
  }
  for (const candidate of candidateNumbers(text)) {
    if (!tokens.has(candidate)) {
      throw new Error(NLG_CONTRADICTION_KEY);
    }
  }
}
