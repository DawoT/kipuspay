import { describe, expect, it, vi } from 'vitest';
import type {
  CatalogImportInput,
  CatalogImportRow,
  NormalizedProductRow,
} from '@kipuspay/domain-integrations';
import { CatalogImporter } from './catalog-importer.js';
import type { D1DatabaseLike } from './index.js';

type Row = Record<string, unknown>;

function productRow(overrides: Partial<NormalizedProductRow> = {}): CatalogImportRow {
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
    ...overrides,
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

function mockDb(handlers: {
  first?: (sql: string, binds: unknown[]) => Row | null;
  all?: (sql: string, binds: unknown[]) => Row[];
}): {
  db: D1DatabaseLike;
  batch: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  statements: { sql: string; binds: unknown[] }[];
} {
  const statements: { sql: string; binds: unknown[] }[] = [];
  const batch = vi.fn().mockResolvedValue([]);
  const prepare = vi.fn((sql: string) => {
    const binds: unknown[] = [];
    statements.push({ sql, binds });
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
      all: <T>() =>
        Promise.resolve({
          results: (handlers.all?.(sql, binds) ?? []) as T[],
          success: true,
        }),
      run: () => Promise.resolve({ success: true }),
    };
    return stmt;
  });
  const db = { prepare, batch } as unknown as D1DatabaseLike;
  return { db, batch, prepare, statements };
}

/** Mock con IGV (1000) configurado — estado normal de un tenant operativo. */
function mockDbWithIgv(): {
  db: D1DatabaseLike;
  batch: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  statements: { sql: string; binds: unknown[] }[];
} {
  return mockDb({
    all: (sql) => (sql.includes('FROM taxes') ? [{ code: '1000' }] : []),
    first: (sql) => (sql.includes('FROM taxes') ? { id: 'tax-igv-1' } : null),
  });
}

describe('CatalogImporter.preview (dry-run)', () => {
  it('no escribe nada y marca filas como create', async () => {
    const { db, batch, prepare } = mockDbWithIgv();
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.kind).toBe('create');
    expect(batch).not.toHaveBeenCalled();
    expect(prepare.mock.calls.some((c) => (c[0] as string).includes('INSERT'))).toBe(false);
  });

  it('reutiliza claves externas ya materializadas sin duplicar', async () => {
    const { db } = mockDb({
      all: (sql) => {
        if (sql.includes('FROM taxes')) return [{ code: '1000' }];
        if (sql.includes('FROM external_entity_map')) {
          return [{ entity_type: 'product', external_id: 'p1', internal_id: 'prod-9' }];
        }
        return [];
      },
    });
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    expect(plan.actions[0]).toMatchObject({ kind: 'skip-duplicate', existingInternalId: 'prod-9' });
  });

  it('reporta conflicto si la tax mapeada no existe para el tenant (regla 1)', async () => {
    const { db } = mockDb({
      first: (sql) => (sql.includes('FROM taxes') ? null : null),
    });
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(input([productRow()]));
    expect(plan.actions).toHaveLength(0);
    expect(plan.conflicts.at(0)?.reason).toBe('impuesto no configurado en el tenant: 1000');
  });

  it('resuelve claves existentes con UNA query de external_entity_map (no N+1)', async () => {
    const { db, statements } = mockDb({
      all: (sql) => {
        if (sql.includes('FROM taxes')) return [{ code: '1000' }];
        if (sql.includes('FROM external_entity_map')) {
          return [{ entity_type: 'product', external_id: 'p2', internal_id: 'prod-9' }];
        }
        return [];
      },
    });
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(
      input([productRow({ externalId: 'p1' }), productRow({ externalId: 'p2' })]),
    );
    const keyQueries = statements.filter((s) => s.sql.includes('FROM external_entity_map'));
    expect(keyQueries).toHaveLength(1);
    expect(keyQueries[0]!.sql).toMatch(/IN\s*\(/);
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[1]).toMatchObject({ kind: 'skip-duplicate', existingInternalId: 'prod-9' });
  });
});

describe('CatalogImporter.commit', () => {
  it('escribe productos, product_taxes y external_entity_map en un solo batch', async () => {
    const { db, batch, prepare } = mockDbWithIgv();
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
      all: (sql) => {
        if (sql.includes('FROM taxes')) return [{ code: '1000' }];
        if (sql.includes('FROM external_entity_map')) {
          return [{ entity_type: 'product', external_id: 'p1', internal_id: 'prod-9' }];
        }
        return [];
      },
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

  it('escribe series con branch_id de la fila, no el tenant_id', async () => {
    const { db, statements } = mockDb({});
    const importer = new CatalogImporter(db);
    const plan = await importer.preview(
      input([
        {
          entityType: 'series',
          externalId: 's1',
          branchId: 'branch-7',
          documentTypeCode: '01',
          prefix: 'F001',
        },
      ]),
    );
    await importer.commit(plan);

    const seriesStmt = statements.find((s) => s.sql.includes('branch_document_series'));
    expect(seriesStmt).toBeDefined();
    expect(seriesStmt!.binds).toEqual([expect.any(String), 't-1', 'branch-7', '01', 'F001']);
  });
});
