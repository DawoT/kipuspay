import type { Cents } from '@kipuspay/domain-sales';

export type CatalogImportSource = 'bsale' | 'alegra' | 'csv';
export type CatalogEntityType = 'product' | 'customer' | 'series';

export interface NormalizedProductRow {
  readonly entityType: 'product';
  readonly externalId: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly name: string;
  readonly unitCode: string;
  readonly priceCents: Cents;
  readonly costCents: Cents;
  readonly taxName: string | null;
  readonly igvAffectationCode: string;
}

export interface NormalizedCustomerRow {
  readonly entityType: 'customer';
  readonly externalId: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly creditLimitCents: Cents;
}

export interface NormalizedSeriesRow {
  readonly entityType: 'series';
  readonly externalId: string;
  readonly documentTypeCode: string;
  readonly prefix: string;
}

export type CatalogImportRow = NormalizedProductRow | NormalizedCustomerRow | NormalizedSeriesRow;

export interface CatalogImportInput {
  readonly source: CatalogImportSource;
  readonly tenantId: string;
  readonly rows: readonly CatalogImportRow[];
  /** Claves externas ya materializadas: `${entityType}:${externalId}` → internalId. */
  readonly existingExternalKeys: ReadonlyMap<string, string>;
}

export type CatalogImportAction =
  | { readonly kind: 'create'; readonly row: CatalogImportRow }
  | {
      readonly kind: 'skip-duplicate';
      readonly row: CatalogImportRow;
      readonly existingInternalId: string;
    };

export interface CatalogImportConflict {
  readonly row: CatalogImportRow;
  readonly reason: string;
}

export interface CatalogImportPlan {
  readonly source: CatalogImportSource;
  readonly tenantId: string;
  readonly actions: readonly CatalogImportAction[];
  readonly conflicts: readonly CatalogImportConflict[];
}

export interface CatalogImportResult {
  readonly importedCount: number;
  readonly skippedCount: number;
}

export type TaxMapping =
  | {
      readonly kind: 'known';
      readonly taxCode: string;
      readonly taxName: string;
      readonly ratePercentage: number;
    }
  | { readonly kind: 'unknown'; readonly externalTaxName: string };

export function externalKeyFor(entityType: CatalogEntityType, externalId: string): string {
  return `${entityType}:${externalId}`;
}

/**
 * Mapea el nombre del impuesto del competidor a la tax canónica KipusPay.
 * Solo reconoce impuestos conocidos; jamás copia reglas fiscales opacas (regla 1 §5.4).
 */
export function mapExternalTax(externalTaxName: string | null | undefined): TaxMapping | null {
  if (!externalTaxName) return null;
  const name = externalTaxName.trim().toUpperCase();
  if (name === 'IGV') {
    return { kind: 'known', taxCode: '1000', taxName: 'IGV', ratePercentage: 18 };
  }
  if (name === 'ICBPER') {
    return { kind: 'known', taxCode: '7152', taxName: 'ICBPER', ratePercentage: 0 };
  }
  return { kind: 'unknown', externalTaxName };
}

function validateProduct(row: NormalizedProductRow): string | null {
  if (row.sku.trim() === '') return 'producto requiere sku';
  if (row.name.trim() === '') return 'producto requiere nombre';
  if (!(row.priceCents >= 0)) return 'precio no puede ser negativo';
  if (!(row.costCents >= 0)) return 'costo no puede ser negativo';
  return null;
}

function validateCustomer(row: NormalizedCustomerRow): string | null {
  if (row.documentTypeCode === '') return 'cliente requiere tipo de documento';
  if (row.documentNumber.trim() === '') return 'cliente requiere número de documento';
  if (!(row.creditLimitCents >= 0)) return 'límite de crédito no puede ser negativo';
  return null;
}

function validateSeries(row: NormalizedSeriesRow): string | null {
  if (row.documentTypeCode === '') return 'serie requiere tipo de documento';
  if (row.prefix.trim() === '') return 'serie requiere prefijo';
  return null;
}

export function validateCatalogRow(row: CatalogImportRow): string | null {
  if (row.entityType === 'product') return validateProduct(row);
  if (row.entityType === 'customer') return validateCustomer(row);
  return validateSeries(row);
}

/**
 * Dry-run del import (regla 1 §5.4): no escribe nada.
 * Reusa claves externas existentes (idempotencia), reporta conflictos de validación
 * e impuestos no mapeables sin copiar reglas fiscales del competidor.
 */
export function planCatalogImport(input: CatalogImportInput): CatalogImportPlan {
  const actions: CatalogImportAction[] = [];
  const conflicts: CatalogImportConflict[] = [];
  const seen = new Set<string>();

  for (const row of input.rows) {
    const validationError = validateCatalogRow(row);
    if (validationError) {
      conflicts.push({ row, reason: validationError });
      continue;
    }
    if (row.entityType === 'product') {
      const mapped = mapExternalTax(row.taxName);
      if (mapped?.kind === 'unknown') {
        conflicts.push({
          row,
          reason: `impuesto no mapeable: ${mapped.externalTaxName}`,
        });
        continue;
      }
    }

    const key = externalKeyFor(row.entityType, row.externalId);
    if (seen.has(key)) {
      conflicts.push({ row, reason: 'clave externa duplicada en el mismo lote' });
      continue;
    }
    seen.add(key);

    const existingInternalId = input.existingExternalKeys.get(key);
    if (existingInternalId) {
      actions.push({ kind: 'skip-duplicate', row, existingInternalId });
    } else {
      actions.push({ kind: 'create', row });
    }
  }

  return { source: input.source, tenantId: input.tenantId, actions, conflicts };
}

export function summarizeImportPlan(plan: CatalogImportPlan): CatalogImportResult {
  let importedCount = 0;
  let skippedCount = 0;
  for (const action of plan.actions) {
    if (action.kind === 'create') importedCount += 1;
    if (action.kind === 'skip-duplicate') skippedCount += 1;
  }
  return { importedCount, skippedCount };
}
