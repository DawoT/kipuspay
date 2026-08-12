/**
 * Inventario de PII (Arquitectura §5.3 regla 32a LPDP-01 / ADR-0031).
 * Puro: catálogo de campos PII del cliente y su proyección de lectura, para que
 * el panel muestre exactamente el inventario y nada más (sin fugas de campos).
 */

export const CUSTOMER_PII_CATALOG = [
  'document_type_code',
  'document_number',
  'name',
  'email',
  'phone',
  'address',
] as const;
export type CustomerPiiCatalogField = (typeof CUSTOMER_PII_CATALOG)[number];

export interface CustomerRow {
  readonly id: string;
  readonly tenantId: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly piiErased: boolean;
  readonly deleted: boolean;
}

export interface PiiInventoryEntry {
  readonly id: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly piiErased: boolean;
}

/**
 * Fila del listado de clientes (GET /api/customers). Proyección mínima sin PII:
 * solo identificación fiscal + estado de anonimización — el DPO navega al
 * detalle por id; el acceso a PII es exclusivo del export (LPDP-02).
 */
export interface CustomerListItem {
  readonly id: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly piiErased: boolean;
}

/**
 * Proyecta un cliente a su inventario PII. Una fila anonimizada (pii_erased)
 * solo expone el documento fiscal retenido (00000000) y campos NULL: jamás
 * re-materializa PII (SEC-07).
 */
export function projectPiiInventory(customer: CustomerRow): PiiInventoryEntry {
  if (customer.piiErased || customer.deleted) {
    return {
      id: customer.id,
      documentTypeCode: customer.documentTypeCode,
      documentNumber: customer.documentNumber,
      name: null,
      email: null,
      phone: null,
      address: null,
      piiErased: true,
    };
  }
  return {
    id: customer.id,
    documentTypeCode: customer.documentTypeCode,
    documentNumber: customer.documentNumber,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    piiErased: false,
  };
}

/**
 * Proyección del listado: identificación fiscal + estado, sin campos PII.
 * Una fila anonimizada mantiene el documento fiscal retenido (00000000).
 */
export function projectCustomerListItem(customer: CustomerRow): CustomerListItem {
  return {
    id: customer.id,
    documentTypeCode: customer.documentTypeCode,
    documentNumber: customer.documentNumber,
    piiErased: customer.piiErased || customer.deleted,
  };
}

/** Verifica que un nombre de columna pertenezca al catálogo PII. */
export function isPiiCatalogField(field: string): field is CustomerPiiCatalogField {
  return (CUSTOMER_PII_CATALOG as readonly string[]).includes(field);
}
