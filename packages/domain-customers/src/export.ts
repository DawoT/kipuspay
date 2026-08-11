/**
 * LPDP-02 — Derecho de acceso/export de PII del titular (Arquitectura §5.3
 * regla 32a / ADR-0031). Puro: arma el payload de export del cliente
 * (perfil + consentimientos + ventas vinculadas), sin PII de otros tenants.
 * El export tenant-wide vive en data_backups (regla 27 / Sprint 42).
 */

export const CUSTOMER_ERASED = 'CUSTOMER_ERASED';

export interface CustomerProfileForExport {
  readonly id: string;
  readonly tenantId: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly piiErased: boolean;
}

export interface ConsentForExport {
  readonly purpose: string;
  readonly granted: boolean;
  readonly grantedAtIso: string | null;
  readonly revokedAtIso: string | null;
}

export interface SaleForExport {
  readonly saleId: string;
  readonly tenantId: string;
  readonly documentType: string;
  readonly series: string;
  readonly number: number;
  readonly issuedAtLimaIso: string;
  readonly totalAmountCents: number;
}

export interface CustomerExportPayload {
  readonly customerId: string;
  readonly tenantId: string;
  readonly profile: {
    readonly documentTypeCode: string;
    readonly documentNumber: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly phone: string | null;
    readonly address: string | null;
  };
  readonly consents: readonly ConsentForExport[];
  readonly sales: readonly SaleForExport[];
}

/** Filtra ventas y consentimientos al tenant del titular (LPDP-04). */
export function buildCustomerExport(
  customer: CustomerProfileForExport,
  consents: readonly ConsentForExport[],
  sales: readonly SaleForExport[],
): CustomerExportPayload {
  if (customer.piiErased) throw new Error(CUSTOMER_ERASED);
  const tenantConsents = consents.filter((c) => c.granted || c.revokedAtIso !== null);
  return {
    customerId: customer.id,
    tenantId: customer.tenantId,
    profile: {
      documentTypeCode: customer.documentTypeCode,
      documentNumber: customer.documentNumber,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
    },
    consents: tenantConsents,
    sales: sales.filter((s) => s.tenantId === customer.tenantId),
  };
}
