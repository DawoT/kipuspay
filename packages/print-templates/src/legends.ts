/**
 * Leyendas fiscales para plantillas (aprobación Staff Fiscal en QG).
 * S11-E8: el texto de la NV es el literal del contrato (Guía Legal Parte I
 * §3.3): "NOTA DE VENTA — Documento de control interno no válido para fines
 * tributarios" — se imprime siempre en las Notas de Venta.
 */

export const NV_TICKET_LEGEND =
  'NOTA DE VENTA — Documento de control interno no válido para fines tributarios';

export const CPE_TICKET_LEGEND =
  'Representación impresa del comprobante electrónico. Consulte validez en SUNAT.';

export function legendForDocument(documentType: string): string {
  if (documentType === 'NV' || documentType === 'NV_RETURN') return NV_TICKET_LEGEND;
  return CPE_TICKET_LEGEND;
}
