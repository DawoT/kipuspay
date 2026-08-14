import { describe, expect, it } from 'vitest';
import { isCatalogImportEnabled, runCatalogImportHttp } from './catalog-import-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(): WorkerEnv {
  const meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
  const okResult = <T>(results: T[] = [] as T[]) => ({
    success: true as const,
    meta,
    results,
  });

  function prepareStatement(sql: string): D1PreparedStatement {
    const binds: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        binds.push(...args);
        return stmt;
      },
      first<T>() {
        if (sql.includes('FROM taxes')) {
          return Promise.resolve({ id: 'tax-igv' } as T);
        }
        return Promise.resolve(null);
      },
      all<T>() {
        if (sql.includes('FROM taxes')) {
          return Promise.resolve(okResult<T>([{ code: '1000' } as T]));
        }
        return Promise.resolve(okResult<T>());
      },
      run<T>() {
        return Promise.resolve(okResult<T>());
      },
      raw<T>(): Promise<[string[], ...T[]]> {
        return Promise.resolve([[] as string[], ...([] as T[])]);
      },
    };
    return stmt;
  }

  const db = {
    prepare(sql: string) {
      return prepareStatement(sql);
    },
    batch<T>(stmts: D1PreparedStatement[]) {
      return Promise.resolve(stmts.map(() => okResult<T>()));
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
    withSession() {
      return {
        prepare(sql2: string) {
          return prepareStatement(sql2);
        },
        batch<T>(stmts: D1PreparedStatement[]) {
          return Promise.resolve(stmts.map(() => okResult<T>()));
        },
        getBookmark() {
          return null;
        },
      };
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
  } satisfies D1Database;

  const env = {
    FEATURE_CATALOG_IMPORT: '1',
    DB: db,
    TENANT_KV: { get: () => Promise.resolve(null) },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => new Response('{}') }),
    },
  } as unknown as WorkerEnv;
  return env;
}

const productRow = {
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

// El nombre del helper dispara un falso positivo de no-secrets (entropía > tolerance).

describe('isCatalogImportEnabled', () => {
  it('default off', () => {
    expect(isCatalogImportEnabled({} as WorkerEnv)).toBe(false);
    expect(isCatalogImportEnabled({ FEATURE_CATALOG_IMPORT: '1' } as WorkerEnv)).toBe(true);
  });
});

describe('runCatalogImportHttp', () => {
  it('FEATURE_OFF sin flag', async () => {
    const env = {
      DB: mockEnv().DB,
      TENANT_KV: mockEnv().TENANT_KV,
      TENANT_STATE_DO: mockEnv().TENANT_STATE_DO,
    } as unknown as WorkerEnv;
    const result = await runCatalogImportHttp(
      env,
      't1',
      {
        source: 'csv',
        mode: 'preview',
        rows: [],
      },
      'admin',
    );
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('FEATURE_OFF');
  });

  it('source inválido → 400', async () => {
    const result = await runCatalogImportHttp(
      mockEnv(),
      't1',
      {
        source: 'siigo',
        mode: 'preview',
        rows: [],
      },
      'admin',
    );
    expect(result.status).toBe(400);
  });

  it('preview (dry-run) devuelve conteo sin escribir', async () => {
    const result = await runCatalogImportHttp(
      mockEnv(),
      't1',
      {
        source: 'csv',
        mode: 'preview',
        rows: [productRow],
      },
      'admin',
    );
    expect(result.status).toBe(200);
    expect(result.body.dryRun).toBe(true);
    expect(result.body.created).toBe(1);
    expect(result.body.conflicts).toHaveLength(0);
  });

  it('commit rechaza con conflictos sin escribir (regla 1)', async () => {
    const result = await runCatalogImportHttp(
      mockEnv(),
      't1',
      {
        source: 'csv',
        mode: 'commit',
        rows: [{ ...productRow, taxName: 'IMPUESTO-RARO' }],
      },
      'admin',
    );
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('IMPORT_CONFLICTS');
  });

  it('commit tras preview importa y reporta resultado', async () => {
    const result = await runCatalogImportHttp(
      mockEnv(),
      't1',
      {
        source: 'csv',
        mode: 'commit',
        rows: [productRow],
      },
      'admin',
    );
    expect(result.status).toBe(200);
    expect(result.body.dryRun).toBe(false);
    expect(result.body.importedCount).toBe(1);
  });
});

describe('límite de lote (S21-H1)', () => {
  it('rechaza lote > MAX_IMPORT_ROWS con 400 antes de tocar el importer', async () => {
    const env = mockEnv();
    const body = {
      source: 'csv',
      mode: 'preview',
      rows: Array.from({ length: 5001 }, () => ({ entityType: 'product', externalId: 'x' })),
    };
    const res = await runCatalogImportHttp(env, 't1', body, 'admin');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('lote en el límite llega al importer (sin 400)', async () => {
    const env = mockEnv();
    const body = {
      source: 'csv',
      mode: 'preview',
      rows: Array.from({ length: 5000 }, () => ({
        entityType: 'product',
        externalId: 'x',
        sku: 'S',
        name: 'N',
        priceCents: 100,
        costCents: 50,
        barcode: null,
        unitCode: 'NIU',
        taxName: null,
        igvAffectationCode: '10',
      })),
    };
    const res = await runCatalogImportHttp(env, 't1', body, 'admin');
    expect(res.status).not.toBe(400);
  });
});

describe('S21-H2 guard de rol del import', () => {
  it('sin rol → 403 FORBIDDEN_ADMIN', async () => {
    const res = await runCatalogImportHttp(mockEnv(), 't1', {
      source: 'csv',
      mode: 'preview',
      rows: [],
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('FORBIDDEN_ADMIN');
  });

  it('rol cashier → 403 FORBIDDEN_ADMIN', async () => {
    const res = await runCatalogImportHttp(
      mockEnv(),
      't1',
      { source: 'csv', mode: 'preview', rows: [] },
      'cashier',
    );
    expect(res.status).toBe(403);
  });

  it('rol admin → pasa al importer (no 403)', async () => {
    const res = await runCatalogImportHttp(
      mockEnv(),
      't1',
      { source: 'csv', mode: 'preview', rows: [] },
      'admin',
    );
    expect(res.status).not.toBe(403);
  });
});
