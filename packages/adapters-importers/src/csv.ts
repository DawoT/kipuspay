import type { Cents } from '@kipuspay/domain-sales';
import type { CatalogImportRow } from '@kipuspay/domain-integrations';

export interface CsvParseError {
  readonly line: number;
  readonly reason: string;
}

export interface CsvParseResult {
  readonly rows: CatalogImportRow[];
  readonly errors: CsvParseError[];
}

const PRODUCT_HEADERS = ['sku', 'price', 'cost', 'tax', 'barcode', 'unit'];
const CUSTOMER_HEADERS = ['doc_type', 'doc_number', 'email', 'credit_limit'];

/** Tokenizer CSV minimalista (RFC 4180) sin dependencias — invariante 10. */
export function tokenizeCsv(input: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      record.push(field);
      field = '';
      records.push(record);
      record = [];
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((c) => c.trim() !== ''));
}

const FORMULA_PREFIX = /^[=+@\t\r]/;

/** CSV formula injection (S21-H1): el valor empieza con un prefijo que Excel
 * interpretaría como fórmula. Nunca se persiste tal cual a DB. */
export function hasFormulaPrefix(value: string | null | undefined): boolean {
  return typeof value === 'string' && FORMULA_PREFIX.test(value.trimStart());
}

function toCents(value: string): Cents | null {
  let trimmed = value.trim();
  // Antes de sanitizar: si quedan letras u operadores NO numéricos tras quitar
  // separadores válidos, el valor es sospechoso (p.ej. `=SUM(1,2)`, `12.50; DROP`).
  // Nunca silenciar con replace — rechazar (fail-closed).
  if (FORMULA_PREFIX.test(trimmed)) return null;
  const onlyNumericShape = trimmed.replace(/[0-9.,-]/g, '');
  if (onlyNumericShape !== '') return null;
  trimmed = trimmed.replace(/[^0-9.,-]/g, '');
  if (trimmed === '' || trimmed === '-') return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastDot > lastComma) {
      trimmed = trimmed.replace(/,/g, '');
    } else {
      trimmed = trimmed.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma >= 0) {
    const decimals = trimmed.length - lastComma - 1;
    if (decimals === 3) {
      trimmed = trimmed.replace(/,/g, '');
    } else {
      trimmed = trimmed.replace(',', '.');
    }
  } else if (lastDot >= 0) {
    const decimals = trimmed.length - lastDot - 1;
    if (decimals === 3) {
      trimmed = trimmed.replace(/\./g, '');
    }
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function rowFromRecord(header: string[], record: string[]): Map<string, string> {
  const row = new Map<string, string>();
  for (let c = 0; c < header.length; c += 1) {
    row.set((header[c] ?? '').trim().toLowerCase(), (record[c] ?? '').trim());
  }
  return row;
}

function formulaInTextRow(row: Map<string, string>, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = row.get(field);
    if (hasFormulaPrefix(value)) {
      return `campo ${field} con prefijo de fórmula: ${value?.trim().slice(0, 40)}`;
    }
  }
  return null;
}

function parseProductRow(row: Map<string, string>): CatalogImportRow | string {
  const externalId = row.get('external_id') ?? '';
  const sku = row.get('sku') ?? '';
  const formula = formulaInTextRow(row, ['external_id', 'sku', 'name', 'barcode']);
  if (formula) return formula;
  if (!externalId) return 'producto requiere external_id';
  if (!sku) return 'producto requiere sku';
  const priceCents = toCents(row.get('price') ?? '');
  if (priceCents === null) return `precio inválido: ${row.get('price')}`;
  const costCents = toCents(row.get('cost') ?? '0') ?? 0;
  return {
    entityType: 'product',
    externalId,
    sku,
    barcode: row.get('barcode') || null,
    name: row.get('name') || sku,
    unitCode: row.get('unit') || 'NIU',
    priceCents,
    costCents,
    taxName: row.get('tax') || null,
    igvAffectationCode: '10',
  };
}

function parseCustomerRow(row: Map<string, string>): CatalogImportRow | string {
  const externalId = row.get('external_id') ?? '';
  const docNumber = row.get('doc_number') ?? '';
  const formula = formulaInTextRow(row, ['external_id', 'doc_number', 'name', 'email']);
  if (formula) return formula;
  if (!externalId) return 'cliente requiere external_id';
  if (!docNumber) return 'cliente requiere doc_number';
  const creditLimitCents = toCents(row.get('credit_limit') ?? '0') ?? 0;
  return {
    entityType: 'customer',
    externalId,
    documentTypeCode: row.get('doc_type') || (docNumber.length > 8 ? '6' : '1'),
    documentNumber: docNumber,
    name: row.get('name') || null,
    email: row.get('email') || null,
    creditLimitCents,
  };
}

function parseRow(
  header: string[],
  record: string[],
  entityType: 'product' | 'customer',
): CatalogImportRow | string {
  const row = rowFromRecord(header, record);
  return entityType === 'product' ? parseProductRow(row) : parseCustomerRow(row);
}

function hasHeader(header: string[], expected: readonly string[]): boolean {
  const normalized = header.map((h) => h.trim().toLowerCase());
  return expected.some((e) => normalized.includes(e));
}

/** CSV enriquecido: una columna `entity_type` = product|customer en cada fila. */
export function parseEnrichedCsv(input: string): CsvParseResult {
  const records = tokenizeCsv(input);
  if (records.length === 0) return { rows: [], errors: [] };

  const header = records[0]!;
  const entityIdx = header.findIndex((h) => h.trim().toLowerCase() === 'entity_type');
  const isProduct = hasHeader(header, PRODUCT_HEADERS);
  const isCustomer = hasHeader(header, CUSTOMER_HEADERS);

  const rows: CatalogImportRow[] = [];
  const errors: CsvParseError[] = [];

  for (let line = 1; line < records.length; line += 1) {
    const record = records[line]!;
    const entityType: 'product' | 'customer' | null =
      entityIdx >= 0
        ? record[entityIdx]?.trim().toLowerCase() === 'customer'
          ? 'customer'
          : 'product'
        : isCustomer && !isProduct
          ? 'customer'
          : 'product';

    const parsed = parseRow(header, record, entityType);
    if (typeof parsed === 'string') {
      errors.push({ line: line + 1, reason: parsed });
    } else {
      rows.push(parsed);
    }
  }

  return { rows, errors };
}
