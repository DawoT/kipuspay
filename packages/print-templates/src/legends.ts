/** Leyendas fiscales para plantillas (aprobación Staff Fiscal en QG). */

export const NV_TICKET_LEGEND =
  'Nota de venta — documento de control interno. No es comprobante de pago autorizado por SUNAT.';

export const CPE_TICKET_LEGEND =
  'Representación impresa del comprobante electrónico. Consulte validez en SUNAT.';

export function legendForDocument(documentType: string): string {
  if (documentType === 'NV' || documentType === 'NV_RETURN') return NV_TICKET_LEGEND;
  return CPE_TICKET_LEGEND;
}
