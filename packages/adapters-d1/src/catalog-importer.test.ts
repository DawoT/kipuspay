import { describe, expect, it, vi } from 'vitest';
import type { CatalogImportInput, CatalogImportRow } from '@kipuspay/domain-integrations';
import { CatalogImporter } from './catalog-importer.js';
import type { D1DatabaseLike } from './index.js';

type Row = Record<string, unknown>;

function productRow(): CatalogImportRow {
  return {
    entityType: 'product',
    externalId: 'p1',
    sku: 'SKU-1',
    barcode: null,
    name: 'Café',
    unitCode: 'NIU',
    priceCents: 1250,
    costCents: 800,
    taxName: 'IGV',
    igvAffectationCode: '10',
  };
}

function customerRow(): CatalogImportRow {
  return {
    entityType: 'customer',
    externalId: 'c1',
    documentTypeCode: '6',
    documentNumber: '20100047218',
    name: 'Cliente S.A.C.',
    email: null,
    creditLimitCents: 0,
  };
}

function input(rows: readonly CatalogImportRow[], existing: Row[] = []): CatalogImportInput {
  return {
    source: 'csv',
    tenantId: 't-1',
    rows,
    existingExternalKeys: new Map<string, string>(
      existing.map((e) => [`${e.entity_type}:${e.external_id}`, String(e.internal_id)]),
    ),
  };
}

function mockDb(handlers: { first?: (sql: string, binds: unknown[]) => Row | null }): {
  db: D1DatabaseLike;
  batch: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
} {
  const batch = vi.fn().mockResolvedValue([]);
  const prepare = vi.fn((sql: string) => {
    const binds: unknown[] = [];
    const stmt: {
      bind(...args: unknown[]): typeof stmt;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[]; success: boolean }>;
      run(): Promise<{ success: boolean }>;
    } = {
      bind(...args: unknown[]) {
        binds.push(...args);
        return stmt;
      },
      first: <T>() => Promise.resolve((handlers.first?.(sql, binds) ?? null) as T | null),
      all: <T>() => Promise.resolve({ results: [] as T[], success: true }),
      run: () => Promise.resolve({ success: true }),
    };
    return stmt;
  });
  const db = { prepare, batch } as unknown as D1DatabaseLike;
  return { db, batch, prepare };
}

describe('CatalogImporter.preview (dry-run)', () => {
  it('no escribe nada y marca filas como create', async () => {
    const { db, batch, prepare } = mockDb({});
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.kind).toBe('create');
    expect(batch).not.toHaveBeenCalled();
    expect(prepare.mock.calls.some((c) => (c[0] as string).includes('INSERT'))).toBe(false);
  });

  it('reutiliza claves externas ya materializadas sin duplicar', async () => {
    const { db } = mockDb({
      first: (sql) => (sql.includes('FROM external_entity_map') ? { internal_id: 'prod-9' } : null),
    });
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    expect(plan.actions[0]).toMatchObject({ kind: 'skip-duplicate', existingInternalId: 'prod-9' });
  });
});

describe('CatalogImporter.commit', () => {
  it('escribe productos, product_taxes y external_entity_map en un solo batch', async () => {
    const { db, batch, prepare } = mockDb({});
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    const result = await importer.commit(plan);

    expect(result).toEqual({ importedCount: 1, skippedCount: 0 });
    expect(batch).toHaveBeenCalledTimes(1);
    const sqls = prepare.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('INSERT INTO products'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO product_taxes'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO external_entity_map'))).toBe(true);
  });

  it('commit de plan sin creates es noop (idempotencia)', async () => {
    const { db, batch, prepare } = mockDb({
      first: (sql) => (sql.includes('FROM external_entity_map') ? { internal_id: 'prod-9' } : null),
    });
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    expect(plan.actions[0]).toMatchObject({ kind: 'skip-duplicate' });
    const result = await importer.commit(plan);

    expect(result).toEqual({ importedCount: 0, skippedCount: 1 });
    expect(batch).not.toHaveBeenCalled();
    expect(prepare.mock.calls.some((c) => (c[0] as string).includes('INSERT'))).toBe(false);
  });

  it('escribe clientes y series', async () => {
    const { db, prepare } = mockDb({});
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([customerRow()]));
    await importer.commit(plan);

    const sqls = prepare.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('INSERT INTO customers'))).toBe(true);
  });
});
