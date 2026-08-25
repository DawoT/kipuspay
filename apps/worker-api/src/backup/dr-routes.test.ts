import { describe, expect, it, vi } from 'vitest';
import { D1_BACKUP_REGISTRY_VERSION } from '@kipuspay/adapters-d1';
import { runDrSimulationHttp, type DrRouteEnv } from './dr-routes.js';

function rawImpl<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
function rawImpl<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
function rawImpl<T = unknown[]>(options?: {
  columnNames?: boolean;
}): Promise<T[] | [string[], ...T[]]> {
  return Promise.resolve(
    (options?.columnNames ? [[], ...([] as T[])] : []) as unknown as T[] | [string[], ...T[]],
  );
}

function mockDb(options?: { readonly stepUpChanges?: number }): D1Database {
  const stepUpChanges = options?.stepUpChanges ?? 1;
  const meta = (changes: number): D1Meta & Record<string, unknown> => ({
    changes,
    duration: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    size_after: 0,
    changed_db: changes > 0,
  });
  const d1Result = <T>(results: T[], changes = 0): D1Result<T> => ({
    success: true,
    meta: meta(changes),
    results,
  });
  const stmt = (sql: string): D1PreparedStatement => ({
    bind() {
      return stmt(sql);
    },
    first: <T = Record<string, unknown>>() => {
      if (sql.includes('FROM data_backups')) {
        return Promise.resolve({
          id: 'bk-dr-1',
          global_hash: 'a'.repeat(64),
          registry_version: D1_BACKUP_REGISTRY_VERSION,
          schema_version: '0035',
          kek_version: 'v1',
          wrapped_dek: new Uint8Array([1]).buffer,
          manifest_r2_key: 'ready/t/b/manifest.kpbk1',
        } as T);
      }
      return Promise.resolve(null as T);
    },
    run: <T = Record<string, unknown>>() =>
      Promise.resolve(
        d1Result([] as T[], sql.includes('authorization_tokens') ? stepUpChanges : 0),
      ),
    all: <T = Record<string, unknown>>() => Promise.resolve(d1Result([] as T[])),
    raw: rawImpl,
  });
  const session: D1DatabaseSession = {
    prepare: (sql) => stmt(sql),
    batch: () => Promise.resolve([]),
    getBookmark: () => null,
  };
  const db: D1Database = {
    prepare: (sql) => stmt(sql),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    withSession: () => session,
    dump: () => Promise.resolve(new ArrayBuffer(0)),
  };
  return db;
}

function mockEnv(options?: { readonly stepUpChanges?: number }): DrRouteEnv {
  return {
    FEATURE_PLATFORM_DR: '1',
    DB: mockDb(options),
    DR_DB: mockDb(),
    BACKUPS: {
      get: () => Promise.resolve(null),
    },
    BACKUP_KMS: {
      unwrapDek: vi.fn(() => Promise.resolve(new Uint8Array(32))),
    },
  };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'owner' };

describe('platform.dr simulation route (Sprint 48)', () => {
  it('flag off → 404 FEATURE_OFF (fail-closed)', async () => {
    const env = { ...mockEnv(), FEATURE_PLATFORM_DR: '0' };
    const res = await runDrSimulationHttp(env, actor, { nowMs: Date.now() });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('sin step-up token → 401 STEP_UP_REQUIRED', async () => {
    const env = mockEnv();
    const res = await runDrSimulationHttp(env, actor, { nowMs: Date.now() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('STEP_UP_REQUIRED');
  });

  it('rol no-owner → 403', async () => {
    const env = mockEnv();
    const res = await runDrSimulationHttp(env, { ...actor, role: 'admin' }, { nowMs: Date.now() });
    expect(res.status).toBe(403);
  });

  it('backup inexistente → 404', async () => {
    const env = mockEnv();
    const db = env.DB as unknown as { prepare(sql: string): { bind(): unknown } };
    const original = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const stmt = original(sql) as { bind(): unknown; first<T>(): Promise<T | null> };
      if (sql.includes('FROM data_backups')) {
        const custom = { ...stmt, first: <T>() => Promise.resolve(null as T | null) };
        custom.bind = () => custom;
        return custom;
      }
      return stmt;
    };
    const res = await runDrSimulationHttp(env, actor, {
      stepUpToken: 'tok',
      nowMs: Date.now(),
    });
    expect(res.status).toBe(404);
  });

  it('dependencia ausente (sin DR_DB) → 503 fail-closed', async () => {
    const env = mockEnv();
    const withoutDrDb = { ...env } as DrRouteEnv & { DR_DB?: never };
    delete withoutDrDb.DR_DB;
    const res = await runDrSimulationHttp(withoutDrDb, actor, {
      stepUpToken: 'tok',
      nowMs: Date.now(),
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DR_DEPENDENCY_UNAVAILABLE');
  });

  it('validación del snapshot falla → 422 BACKUP_R2_OBJECT_MISSING (fail-closed, sin apply)', async () => {
    const env = mockEnv();
    const res = await runDrSimulationHttp(env, actor, {
      stepUpToken: 'tok',
      nowMs: Date.now(),
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BACKUP_R2_OBJECT_MISSING');
  });

  it('step-up consume acepta meta.changes>=1 (epoch trigger en authorization_tokens)', async () => {
    // D1 cuenta el UPDATE del token + el UPDATE de tenant_data_epochs vía trigger.
    const env = mockEnv({ stepUpChanges: 2 });
    const res = await runDrSimulationHttp(env, actor, {
      stepUpToken: 'tok',
      nowMs: Date.now(),
    });
    expect(res.status).not.toBe(401);
    expect(res.body.code).not.toBe('STEP_UP_REQUIRED');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BACKUP_R2_OBJECT_MISSING');
  });

  it('backup registry-1 vs código actual (registry-3) → 422 BACKUP_REGISTRY_STALE (sin apply)', async () => {
    const env = mockEnv();
    const db = env.DB as unknown as { prepare(sql: string): { bind(): unknown } };
    const original = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const stmt = original(sql) as { bind(): unknown; first<T>(): Promise<T | null> };
      if (sql.includes('FROM data_backups')) {
        const custom = {
          ...stmt,
          first: <T>() =>
            Promise.resolve({
              id: 'bk-dr-1',
              global_hash: 'a'.repeat(64),
              registry_version: 'registry-1',
              schema_version: '0035',
              kek_version: 'v1',
              wrapped_dek: new Uint8Array([1]).buffer,
              manifest_r2_key: 'k/m',
            } as T),
        };
        custom.bind = () => custom;
        return custom;
      }
      return stmt;
    };
    const res = await runDrSimulationHttp(env, actor, {
      stepUpToken: 'tok',
      nowMs: Date.now(),
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BACKUP_REGISTRY_STALE');
    expect(res.body.mismatch).toBe('registry_version');
    expect(res.body.actual).toBe('registry-1');
  });
});
