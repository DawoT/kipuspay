import type { CatalogImportRow } from '@kipuspay/domain-integrations';

export interface BsaleProductPayload {
  readonly id: number;
  readonly name?: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly prices?: readonly { readonly netPrice?: number; readonly grossPrice?: number }[];
  readonly taxNames?: readonly string[];
}

export interface BsaleCustomerPayload {
  readonly id: number;
  readonly code?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly company?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly city?: { readonly name?: string };
  readonly state?: string;
}

/** Bsale expone precios en PEN (unitarios, no centavos) y montos en S/ enteros. */
export function parseBsaleProducts(payloads: readonly BsaleProductPayload[]): CatalogImportRow[] {
  const rows: CatalogImportRow[] = [];
  for (const payload of payloads) {
    const sku = payload.sku?.trim() || `BSALE-${payload.id}`;
    const price = payload.prices?.[0]?.grossPrice ?? payload.prices?.[0]?.netPrice ?? 0;
    const priceCents = Math.round(price * 100);
    rows.push({
      entityType: 'product',
      externalId: String(payload.id),
      sku,
      barcode: payload.barcode ?? null,
      name: payload.name?.trim() || sku,
      unitCode: 'NIU',
      priceCents,
      costCents: 0,
      taxName: payload.taxNames?.[0] ?? null,
      igvAffectationCode: '10',
    });
  }
  return rows;
}

export function parseBsaleCustomers(payloads: readonly BsaleCustomerPayload[]): CatalogImportRow[] {
  const rows: CatalogImportRow[] = [];
  for (const payload of payloads) {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim();
    const documentNumber = payload.code?.trim() ?? '';
    const documentTypeCode = documentNumber.length > 8 ? '6' : documentNumber ? '1' : '';
    rows.push({
      entityType: 'customer',
      externalId: String(payload.id),
      documentTypeCode,
      documentNumber,
      name: payload.company?.trim() || name || null,
      email: payload.email?.trim() ?? null,
      creditLimitCents: 0,
    });
  }
  return rows;
}
