/**
 * Selector de documento por modo/régimen + identidad cliente (Sprint 7).
 * Puro: sin D1/UI. Tipos locales para evitar ciclo con index.
 */

export type SuggestDocCode = 'NV' | '01' | '03';
export type SuggestFormalizationMode = 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';
export type SuggestTaxRegime = 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';

export interface SuggestDocumentInput {
  readonly formalizationMode: SuggestFormalizationMode;
  readonly taxRegime: SuggestTaxRegime;
  readonly clientDocumentType: string;
  readonly clientDocumentNumber: string;
}

/** Auto Factura si RUC; Boleta si consumidor; NV en control interno. */
export function suggestDocumentType(input: SuggestDocumentInput): SuggestDocCode {
  if (input.formalizationMode === 'INTERNAL_CONTROL') {
    return 'NV';
  }
  const isRuc =
    input.clientDocumentType === '6' && /^\d{11}$/.test(input.clientDocumentNumber.trim());
  if (isRuc && input.taxRegime !== 'NRUS') {
    return '01';
  }
  return '03';
}

export function formalizationBannerMessage(mode: SuggestFormalizationMode): string {
  if (mode === 'INTERNAL_CONTROL') {
    // S11-E9 (GTM §3.3.1): banner persistente con el llamado a formalizar.
    return 'Tu negocio aún no emite comprobantes electrónicos: solo notas de venta (NV). Activa facturación cuando estés listo.';
  }
  if (mode === 'FORMALIZING') {
    return 'Formalizando — puedes emitir CPE o NV según régimen.';
  }
  return 'Emisor electrónico — CPE según régimen SUNAT.';
}
