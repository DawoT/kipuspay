import { describe, expect, it } from 'vitest';
import {
  externalKeyFor,
  mapExternalTax,
  planCatalogImport,
  summarizeImportPlan,
  validateCatalogRow,
  type CatalogImportInput,
  type NormalizedCustomerRow,
  type NormalizedProductRow,
  type NormalizedSeriesRow,
} from './catalog-import.js';

function productRow(overrides: Partial<NormalizedProductRow> = {}): NormalizedProductRow {
  return {
    entityType: 'product',
    externalId: 'p-1',
    sku: 'SKU-1',
    barcode: null,
    name: 'Café molido',
    unitCode: 'NIU',
    priceCents: 1200,
    costCents: 800,
    taxName: 'IGV',
    igvAffectationCode: '10',
    ...overrides,
  };
}

function customerRow(overrides: Partial<NormalizedCustomerRow> = {}): NormalizedCustomerRow {
  return {
    entityType: 'customer',
    externalId: 'c-1',
    documentTypeCode: '1',
    documentNumber: '20100047218',
    name: 'Cliente S.A.C.',
    email: null,
    creditLimitCents: 0,
    ...overrides,
  };
}

function seriesRow(overrides: Partial<NormalizedSeriesRow> = {}): NormalizedSeriesRow {
  return {
    entityType: 'series',
    externalId: 's-1',
    documentTypeCode: '01',
    prefix: 'F001',
    ...overrides,
  };
}

function input(rows: CatalogImportInput['rows']): CatalogImportInput {
  return { source: 'bsale', tenantId: 't-1', rows, existingExternalKeys: new Map() };
}

describe('validateCatalogRow', () => {
  it('acepta un producto válido', () => {
    expect(validateCatalogRow(productRow())).toBeNull();
  });

  it('rechaza producto sin sku', () => {
    expect(validateCatalogRow(productRow({ sku: ' ' }))).toBe('producto requiere sku');
  });

  it('rechaza producto sin nombre', () => {
    expect(validateCatalogRow(productRow({ name: '  ' }))).toBe('producto requiere nombre');
  });

  it('rechaza costo negativo', () => {
    expect(validateCatalogRow(productRow({ costCents: -2 }))).toBe('costo no puede ser negativo');
  });

  it('rechaza precio negativo', () => {
    expect(validateCatalogRow(productRow({ priceCents: -1 }))).toBe('precio no puede ser negativo');
  });

  it('rechaza cliente sin documento', () => {
    expect(validateCatalogRow(customerRow({ documentNumber: '' }))).toBe(
      'cliente requiere número de documento',
    );
  });

  it('rechaza cliente sin tipo de documento', () => {
    expect(validateCatalogRow(customerRow({ documentTypeCode: '' }))).toBe(
      'cliente requiere tipo de documento',
    );
  });

  it('rechaza límite de crédito negativo', () => {
    expect(validateCatalogRow(customerRow({ creditLimitCents: -1 }))).toBe(
      'límite de crédito no puede ser negativo',
    );
  });

  it('rechaza serie sin tipo de documento', () => {
    expect(validateCatalogRow(seriesRow({ documentTypeCode: '' }))).toBe(
      'serie requiere tipo de documento',
    );
  });

  it('rechaza serie sin prefijo', () => {
    expect(validateCatalogRow(seriesRow({ prefix: '' }))).toBe('serie requiere prefijo');
  });
});

describe('mapExternalTax', () => {
  it('mapea IGV a la tax canónica 1000', () => {
    expect(mapExternalTax('IGV')).toEqual({
      kind: 'known',
      taxCode: '1000',
      taxName: 'IGV',
      ratePercentage: 18,
    });
  });

  it('mapea ICBPER a la tax canónica 7152', () => {
    expect(mapExternalTax('icbper')).toEqual({
      kind: 'known',
      taxCode: '7152',
      taxName: 'ICBPER',
      ratePercentage: 0,
    });
  });

  it('reporta impuesto desconocido como no mapeable', () => {
    expect(mapExternalTax('GRAVADO-VIEJO')).toEqual({
      kind: 'unknown',
      externalTaxName: 'GRAVADO-VIEJO',
    });
  });

  it('devuelve null sin taxName', () => {
    expect(mapExternalTax(null)).toBeNull();
  });
});

describe('planCatalogImport (dry-run: no escribe)', () => {
  it('marca filas nuevas como create', () => {
    const plan = planCatalogImport(input([productRow()]));
    expect(plan.actions).toHaveLength(1);
    const [action] = plan.actions;
    expect(action).toEqual({ kind: 'create', row: productRow() });
    expect(plan.conflicts).toHaveLength(0);
  });

  it('reusa clave externa existente sin duplicar', () => {
    const keys = new Map([[externalKeyFor('product', 'p-1'), 'prod-9']]);
    const plan = planCatalogImport({ ...input([productRow()]), existingExternalKeys: keys });
    const [action] = plan.actions;
    expect(action).toEqual({
      kind: 'skip-duplicate',
      row: productRow(),
      existingInternalId: 'prod-9',
    });
  });

  it('idempotencia: reimportar filas ya materializadas no crea filas nuevas', () => {
    const keys = new Map([
      [externalKeyFor('product', 'p-1'), 'prod-9'],
      [externalKeyFor('product', 'p-2'), 'prod-10'],
    ]);
    const plan = planCatalogImport({
      ...input([productRow(), productRow({ externalId: 'p-2' })]),
      existingExternalKeys: keys,
    });
    expect(plan.actions.filter((a) => a.kind === 'create')).toHaveLength(0);
    expect(plan.actions.filter((a) => a.kind === 'skip-duplicate')).toHaveLength(2);
  });

  it('reporta conflicto por impuesto no mapeable sin importar', () => {
    const plan = planCatalogImport(input([productRow({ taxName: 'IMPUESTO-RARO' })]));
    expect(plan.actions).toHaveLength(0);
    expect(plan.conflicts.at(0)?.reason).toBe('impuesto no mapeable: IMPUESTO-RARO');
  });

  it('reporta clave externa duplicada dentro del mismo lote', () => {
    const plan = planCatalogImport(input([productRow(), productRow()]));
    expect(plan.actions.filter((a) => a.kind === 'create')).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts.at(0)?.reason).toBe('clave externa duplicada en el mismo lote');
  });

  it('reporta conflicto de validación sin importar', () => {
    const plan = planCatalogImport(input([productRow({ priceCents: -5 })]));
    expect(plan.actions).toHaveLength(0);
    expect(plan.conflicts.at(0)?.reason).toBe('precio no puede ser negativo');
  });

  it('mezcla creates, skips y conflictos en un solo lote', () => {
    const keys = new Map([[externalKeyFor('customer', 'c-1'), 'cust-7']]);
    const plan = planCatalogImport({
      ...input([productRow(), customerRow(), seriesRow(), productRow({ externalId: 'p-9' })]),
      existingExternalKeys: keys,
    });
    expect(plan.actions.filter((a) => a.kind === 'create')).toHaveLength(3);
    expect(plan.actions.filter((a) => a.kind === 'skip-duplicate')).toHaveLength(1);
  });

  it('no escribe nada (pureza): no muta el input', () => {
    const rows = [productRow()];
    const plan = planCatalogImport(input(rows));
    expect(plan.actions).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(input(rows).existingExternalKeys.size).toBe(0);
  });
});

describe('summarizeImportPlan', () => {
  it('cuenta importados y omitidos', () => {
    const plan = planCatalogImport({
      ...input([productRow(), productRow({ externalId: 'p-2' }), customerRow()]),
      existingExternalKeys: new Map([[externalKeyFor('product', 'p-2'), 'prod-10']]),
    });
    expect(summarizeImportPlan(plan)).toEqual({ importedCount: 2, skippedCount: 1 });
  });
});
