/**
 * Sprint 50 — clasificador de escaneo por namespace (Arquitectura §5.3 regla 34,
 * edge 1A).
 *
 * El lector compartido (regla 34/36) rutea por prefijo reservado:
 * - `EMP-` + dígitos ⇒ badge de vendedor (VENDOR_SCOPE); jamás un producto.
 * - Dígitos (EAN-13/UPC u otros) ⇒ barcode de producto (PRODUCT_SCOPE).
 * - Cualquier otra cosa ⇒ UNKNOWN (fail-closed, nunca se resuelve).
 *
 * `EMP-` está PROHIBIDO como barcode de producto: lo validan este módulo
 * (isReservedBarcode), el índice único de la migración 0042 y el
 * CatalogImporter. Puro: sin D1, sin deps de red.
 */

export type ScanClassification = 'PRODUCT_SCOPE' | 'VENDOR_SCOPE' | 'UNKNOWN';

export const VENDOR_PREFIX = 'EMP-';

/** true si el raw pertenece al namespace reservado de vendedores (cualquier sufijo). */
export function isReservedBarcode(raw: string): boolean {
  return raw.startsWith(VENDOR_PREFIX);
}

/**
 * Clasifica un escaneo. Prefijo EMP- + dígitos ⇒ vendedor; solo dígitos ⇒
 * producto; el resto ⇒ UNKNOWN.
 */
export function classifyScan(raw: string | null | undefined): ScanClassification {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const value = raw.trim();
  if (value.length === 0) return 'UNKNOWN';
  if (value.startsWith(VENDOR_PREFIX)) {
    const suffix = value.slice(VENDOR_PREFIX.length);
    return /^\d+$/.test(suffix) && suffix.length > 0 ? 'VENDOR_SCOPE' : 'UNKNOWN';
  }
  return /^\d+$/.test(value) ? 'PRODUCT_SCOPE' : 'UNKNOWN';
}
