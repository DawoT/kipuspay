import type { CatalogImportRow } from '@kipuspay/domain-integrations';

export interface AlegraItemPayload {
  readonly id: number;
  readonly name?: string;
  readonly description?: string;
  readonly price?: number;
  readonly reference?: string;
  readonly barcode?: string;
  readonly tax?: readonly { readonly name?: string }[];
}

export interface AlegraContactPayload {
  readonly id: number;
  readonly name?: string;
  readonly identification?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly creditLimit?: number;
}

export function parseAlegraItems(payloads: readonly AlegraItemPayload[]): CatalogImportRow[] {
  const rows: CatalogImportRow[] = [];
  for (const payload of payloads) {
    const reference = payload.reference?.trim() || `ALEGRA-${payload.id}`;
    const priceCents = Math.round((payload.price ?? 0) * 100);
    rows.push({
      entityType: 'product',
      externalId: String(payload.id),
      sku: reference,
      barcode: payload.barcode ?? null,
      name: payload.name?.trim() || reference,
      unitCode: 'NIU',
      priceCents,
      costCents: 0,
      taxName: payload.tax?.[0]?.name ?? null,
      igvAffectationCode: '10',
    });
  }
  return rows;
}

export function parseAlegraContacts(payloads: readonly AlegraContactPayload[]): CatalogImportRow[] {
  const rows: CatalogImportRow[] = [];
  for (const payload of payloads) {
    const documentNumber = (payload.identification ?? '').replace(/[^0-9]/g, '');
    const documentTypeCode = documentNumber.length > 8 ? '6' : documentNumber ? '1' : '';
    rows.push({
      entityType: 'customer',
      externalId: String(payload.id),
      documentTypeCode,
      documentNumber,
      name: payload.name?.trim() ?? null,
      email: payload.email?.trim() ?? null,
      creditLimitCents: Math.round((payload.creditLimit ?? 0) * 100),
    });
  }
  return rows;
}
