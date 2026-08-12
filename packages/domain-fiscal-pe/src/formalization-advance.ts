/**
 * Avance de etapa de formalización — GTM §3.3.1 / §6.2.
 * No convierte NV históricas; solo cambia el default hacia adelante.
 */

export type FormalizationMode = 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';

export type EnabledDocCode = 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12';

const ORDER: readonly FormalizationMode[] = [
  'INTERNAL_CONTROL',
  'FORMALIZING',
  'ELECTRONIC_ISSUER',
];

function rank(mode: FormalizationMode): number {
  return ORDER.indexOf(mode);
}

export function assertFormalizationAdvance(from: FormalizationMode, to: FormalizationMode): void {
  if (from === to) return;
  const a = rank(from);
  const b = rank(to);
  if (b < a) {
    throw new Error('No se puede retroceder de etapa de formalizacion');
  }
  if (b > a + 1) {
    throw new Error('Debes confirmar cada etapa intermedia antes de saltar');
  }
}

export function advanceFormalization(
  from: FormalizationMode,
  to: FormalizationMode,
): FormalizationMode {
  assertFormalizationAdvance(from, to);
  return to;
}

/** Documentos habilitados por etapa (sin reescribir historial NV). */
export function enabledDocumentTypesFor(mode: FormalizationMode): readonly EnabledDocCode[] {
  if (mode === 'INTERNAL_CONTROL') return ['NV', 'NV_RETURN'];
  if (mode === 'FORMALIZING') return ['NV', 'NV_RETURN', '03', '07', '08'];
  return ['NV', 'NV_RETURN', '01', '03', '07', '08', '12'];
}

/**
 * Fail-closed (invariante 5): el documento a emitir debe estar en la columna
 * `tenants.enabled_document_types` (JSON array). Una columna vacía, inválida o
 * ausente NUNCA habilita por omisión: sin lista autoritativa no hay emisión.
 */
export function assertDocumentTypeEnabled(
  documentType: EnabledDocCode,
  enabledDocumentTypesRaw: string | null | undefined,
): void {
  if (!enabledDocumentTypesRaw?.trim()) {
    throw new Error('DOCUMENT_TYPE_NOT_ENABLED');
  }
  let enabled: unknown;
  try {
    enabled = JSON.parse(enabledDocumentTypesRaw);
  } catch {
    throw new Error('DOCUMENT_TYPE_NOT_ENABLED');
  }
  if (!Array.isArray(enabled) || enabled.length === 0) {
    throw new Error('DOCUMENT_TYPE_NOT_ENABLED');
  }
  const codes: string[] = enabled.map((x) => String(x).trim());
  if (!codes.includes(documentType)) {
    throw new Error('DOCUMENT_TYPE_NOT_ENABLED');
  }
}
