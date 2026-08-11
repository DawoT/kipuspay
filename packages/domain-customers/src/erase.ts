/**
 * LPDP-03 — Borrado/anonimización (Arquitectura §5.3 regla 32a / SEC-07).
 * Puro: decide qué columnas anonimizar y qué snapshots fiscales sellar; el
 * adaptador lo ejecuta en un db.batch([...]). Nunca destruye CPE/XML emitidos
 * a SUNAT (retención fiscal ~5 años); anonimiza el vínculo a persona.
 */

export const ANONYMIZED_NAME = '[ANONYMIZED]';
export const ANONYMIZED_DOCUMENT = '00000000';
export const ALREADY_ERASED = 'ALREADY_ERASED';

/** Columnas PII del perfil que se anonimizan a NULL en customers. */
export const CUSTOMER_PII_NULLABLE_FIELDS = [
  'name',
  'email',
  'phone',
  'address',
] as const;
export type CustomerPiiField = (typeof CUSTOMER_PII_NULLABLE_FIELDS)[number];

export interface CustomerForErase {
  readonly id: string;
  readonly tenantId: string;
  readonly piiErased: boolean;
  readonly deleted: boolean;
}

export interface FiscalSnapshotForErase {
  readonly saleId: string;
  readonly tenantId: string;
  readonly clientName: string;
  readonly clientDocumentNumber: string;
}

export interface ConsentRevocationForErase {
  readonly consentId: string;
  readonly purpose: string;
  readonly tenantId: string;
  readonly customerId: string;
}

export interface ErasePlan {
  readonly customerId: string;
  readonly tenantId: string;
  /** customers: name/email/phone/address → NULL, pii_erased=1, erased_at sellado. */
  readonly profileFields: ReadonlyArray<{ readonly field: CustomerPiiField; readonly value: null }>;
  /** sales snapshots fiscales: client_name → '[ANONYMIZED]', doc → '00000000'. */
  readonly fiscalSnapshots: ReadonlyArray<{
    readonly saleId: string;
    readonly clientName: typeof ANONYMIZED_NAME;
    readonly clientDocumentNumber: typeof ANONYMIZED_DOCUMENT;
  }>;
  /** consentimientos revocados con sello (revoked_at). */
  readonly consentRevocations: ReadonlyArray<ConsentRevocationForErase>;
}

/**
 * Lanza ALREADY_ERASED si la fila ya está anonimizada o borrada (idempotencia
 * fail-closed: jamás se re-anonimiza ni se re-vivifica PII).
 */
export function assertNotErased(customer: CustomerForErase): void {
  if (customer.piiErased || customer.deleted) throw new Error(ALREADY_ERASED);
}

/**
 * Construye el plan de anonimización de un cliente y sus snapshots fiscales.
 * Solo se anonimizan los snapshots que aún conservan PII (client_name distinto
 * del placeholder o documento distinto de 00000000).
 */
export function planCustomerErase(
  customer: CustomerForErase,
  fiscalSnapshots: readonly FiscalSnapshotForErase[],
  consentRevocations: readonly ConsentRevocationForErase[],
): ErasePlan {
  assertNotErased(customer);
  const snapshotPlan = fiscalSnapshots
    .filter((row) => row.tenantId === customer.tenantId)
    .filter(
      (row) =>
        row.clientName !== ANONYMIZED_NAME || row.clientDocumentNumber !== ANONYMIZED_DOCUMENT,
    )
    .map(
      (row): {
        saleId: string;
        clientName: typeof ANONYMIZED_NAME;
        clientDocumentNumber: typeof ANONYMIZED_DOCUMENT;
      } => ({
        saleId: row.saleId,
        clientName: ANONYMIZED_NAME,
        clientDocumentNumber: ANONYMIZED_DOCUMENT,
      }),
    );
  return {
    customerId: customer.id,
    tenantId: customer.tenantId,
    profileFields: CUSTOMER_PII_NULLABLE_FIELDS.map((field) => ({ field, value: null })),
    fiscalSnapshots: snapshotPlan,
    consentRevocations: consentRevocations.filter((c) => c.tenantId === customer.tenantId),
  };
}

export function isAnonymousDocument(documentNumber: string): boolean {
  return !documentNumber.trim() || documentNumber === ANONYMIZED_DOCUMENT;
}
