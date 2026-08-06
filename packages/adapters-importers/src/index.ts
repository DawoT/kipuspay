export interface RawImportRow {
  readonly [column: string]: unknown;
}

export type ImportValidation =
  | { readonly ok: true; readonly row: RawImportRow }
  | { readonly ok: false; readonly error: string };

export function validateImportRow(row: RawImportRow): ImportValidation {
  if (typeof row.sku !== 'string' || row.sku.length === 0) {
    return { ok: false, error: 'sku requerido' };
  }
  return { ok: true, row };
}

export function countErrors(rows: readonly RawImportRow[]): number {
  let errors = 0;
  for (const row of rows) {
    if (!validateImportRow(row).ok) {
      errors += 1;
    }
  }
  return errors;
}

export type { AlegraContactPayload, AlegraItemPayload } from './alegra.js';
export { parseAlegraContacts, parseAlegraItems } from './alegra.js';
export type { BsaleCustomerPayload, BsaleProductPayload } from './bsale.js';
export { parseBsaleCustomers, parseBsaleProducts } from './bsale.js';
export type { CsvParseError, CsvParseResult } from './csv.js';
export { parseEnrichedCsv, tokenizeCsv } from './csv.js';
