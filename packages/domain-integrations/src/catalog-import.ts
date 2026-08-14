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
  readonly branchId: string;
  readonly documentTypeCode: string;
  readonly prefix: string;
}

export type CatalogImportRow = NormalizedProductRow | NormalizedCustomerRow | NormalizedSeriesRow;

export interface CatalogImportInput {
  readonly source: CatalogImportSource;
  readonly tenantId: string;
  readonly rows: readonly CatalogImportRow[];
  /** Claves externas ya materializadas: `${entityType}:${externalId}` → internalId. */
  readonly existingExternalKeys?: ReadonlyMap<string, string>;
  /** Códigos de impuesto canónicos disponibles en el tenant (fuente: tabla taxes). */
  readonly availableTaxCodes?: ReadonlySet<string>;
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
    }
  | { readonly kind: 'unknown'; readonly externalTaxName: string };

/** Tope de filas por lote de import (S21-H1): protege memoria/CPU del worker
 * ante archivos gigantes o maliciosos. El cliente lo valida en preview; el
 * dominio lo vuelve a aplicar en plan (defensa en profundidad). */
export const MAX_IMPORT_ROWS = 5000;

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
    return { kind: 'known', taxCode: '1000', taxName: 'IGV' };
  }
  if (name === 'ICBPER') {
    return { kind: 'known', taxCode: '7152', taxName: 'ICBPER' };
  }
  return { kind: 'unknown', externalTaxName };
}

/** Prefijos que Excel interpreta como fórmula (CSV formula injection). */
const FORMULA_PREFIX = /^[=+@\t\r]/;

export function hasFormulaPrefix(value: string | null | undefined): boolean {
  return typeof value === 'string' && FORMULA_PREFIX.test(value.trimStart());
}

function formulaReason(field: string, value: string | null | undefined): string | null {
  return hasFormulaPrefix(value) ? `campo ${field} con prefijo de fórmula` : null;
}

function validateProduct(row: NormalizedProductRow): string | null {
  if (row.sku.trim() === '') return 'producto requiere sku';
  if (row.name.trim() === '') return 'producto requiere nombre';
  const formula =
    formulaReason('sku', row.sku) ??
    formulaReason('name', row.name) ??
    formulaReason('barcode', row.barcode);
  if (formula) return formula;
  if (row.barcode?.trim().startsWith('EMP-')) {
    return 'barcode EMP- está reservado para badges de vendedor (regla 34/36)';
  }
  if (!(row.priceCents > 0)) {
    return row.priceCents < 0 ? 'precio no puede ser negativo' : 'producto requiere precio';
  }
  if (!(row.costCents >= 0)) return 'costo no puede ser negativo';
  return null;
}

function validateCustomer(row: NormalizedCustomerRow): string | null {
  if (row.documentTypeCode === '') return 'cliente requiere tipo de documento';
  if (row.documentNumber.trim() === '') return 'cliente requiere número de documento';
  const formula =
    formulaReason('name', row.name) ??
    formulaReason('email', row.email) ??
    formulaReason('doc_number', row.documentNumber);
  if (formula) return formula;
  if (!(row.creditLimitCents >= 0)) return 'límite de crédito no puede ser negativo';
  return null;
}

function validateSeries(row: NormalizedSeriesRow): string | null {
  if (row.branchId.trim() === '') return 'serie requiere sucursal';
  if (row.documentTypeCode === '') return 'serie requiere tipo de documento';
  if (row.prefix.trim() === '') return 'serie requiere prefijo';
  return null;
}

export function validateCatalogRow(row: CatalogImportRow): string | null {
  if (row.entityType === 'product') return validateProduct(row);
  if (row.entityType === 'customer') return validateCustomer(row);
  if (row.entityType === 'series') return validateSeries(row);
  const unknown = (row as { entityType?: unknown }).entityType;
  return `tipo de entidad no soportado: ${String(unknown)}`;
}

/** Razón de conflicto fiscal de un producto, si aplica (regla 1 §5.4). */
function taxConflictReason(
  row: NormalizedProductRow,
  availableTaxCodes: ReadonlySet<string> | undefined,
): string | null {
  const mapped = mapExternalTax(row.taxName);
  if (mapped?.kind === 'unknown') return `impuesto no mapeable: ${mapped.externalTaxName}`;
  if (
    mapped?.kind === 'known' &&
    availableTaxCodes !== undefined &&
    !availableTaxCodes.has(mapped.taxCode)
  ) {
    return `impuesto no configurado en el tenant: ${mapped.taxCode}`;
  }
  return null;
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
  const existingKeys = input.existingExternalKeys ?? new Map<string, string>();

  if (input.rows.length > MAX_IMPORT_ROWS) {
    conflicts.push({
      row: input.rows[0]!,
      reason: `lote excede el límite de ${MAX_IMPORT_ROWS} filas`,
    });
    return { source: input.source, tenantId: input.tenantId, actions, conflicts };
  }

  for (const row of input.rows) {
    const validationError = validateCatalogRow(row);
    if (validationError) {
      conflicts.push({ row, reason: validationError });
      continue;
    }
    if (row.entityType === 'product') {
      const taxConflict = taxConflictReason(row, input.availableTaxCodes);
      if (taxConflict) {
        conflicts.push({ row, reason: taxConflict });
        continue;
      }
    }

    const key = externalKeyFor(row.entityType, row.externalId);
    if (seen.has(key)) {
      conflicts.push({ row, reason: 'clave externa duplicada en el mismo lote' });
      continue;
    }
    seen.add(key);

    const existingInternalId = existingKeys.get(key);
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
