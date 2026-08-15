import { describe, expect, it } from 'vitest';
import {
  persistBootstrap,
  seriesSeedFor,
  tenantAuthSnapshot,
  type BootstrapPersistenceInput,
} from './onboarding-bootstrap-persist.js';
import type { D1DatabaseLike } from './index.js';

function input(overrides: Partial<BootstrapPersistenceInput> = {}): BootstrapPersistenceInput {
  return {
    tenantId: 't_bootstrap',
    tradeName: 'Bodega Doña Pepa',
    verticalType: 'retail',
    formalizationMode: 'INTERNAL_CONTROL',
    ruc: null,
    enabledDocumentTypes: ['NV'],
    trialEndsAtIso: '2026-09-13T00:00:00.000Z',
    branchId: 'br-1',
    registerId: 'reg-1',
    sessionId: 'sess-1',
    ownerUserId: 'owner-1',
    ownerEmail: 'owner.t_bootstrap@kipuspay.com',
    ownerBadge: 'EMP-12345',
    ownerPinHash: '$argon2id$v=19$m=65536,t=3,p=1$abc$def',
    nowIso: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}

function mockDb() {
  const statements: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        first<T>() {
          return Promise.resolve(null as T);
        },
        run() {
          statements.push({ sql, binds });
          return Promise.resolve({ meta: { changes: 1 } });
        },
        raw<T>(): Promise<[string[], ...T[]]> {
          return Promise.resolve([[] as string[], ...([] as T[])]);
        },
      };
      (stmt as unknown as { sql: string; binds: unknown[] }).sql = sql;
      (stmt as unknown as { sql: string; binds: unknown[] }).binds = binds;
      return stmt;
    },
    batch<T>(stmts: unknown[]) {
      for (const s of stmts as { sql: string; binds: unknown[] }[]) {
        statements.push(s);
      }
      return Promise.resolve(stmts.map(() => ({})) as T[]);
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
    withSession() {
      return { prepare: db.prepare.bind(db), batch: db.batch.bind(db) };
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
  };
  return { db: db as unknown as D1DatabaseLike, statements };
}

describe('persistBootstrap (M6A — adapters-d1)', () => {
  it('reserva KV primero y escribe el batch atómico de las 6 tablas', async () => {
    const { db, statements } = mockDb();
    const kvPut: string[] = [];
    const kvDelete: string[] = [];
    await persistBootstrap(
      db,
      (k) => {
        kvPut.push(k);
        return Promise.resolve();
      },
      (k) => {
        kvDelete.push(k);
        return Promise.resolve();
      },
      input(),
    );
    expect(kvPut).toEqual(['tenant:t_bootstrap']);
    const sql = statements.map((s) => s.sql).join('\n');
    expect(sql).toContain('INSERT INTO tenants');
    expect(sql).toContain('INSERT INTO branches');
    expect(sql).toContain('INSERT INTO cash_registers');
    expect(sql).toContain('INSERT INTO users');
    expect(sql).toContain('INSERT INTO cash_register_sessions');
    expect(sql).toContain('INSERT INTO growth_events');
    expect(sql).toContain('INSERT INTO branch_document_series');
    expect(sql).toContain('INSERT INTO payment_methods');
    expect(kvDelete).toHaveLength(0);
  });

  it('revierte el KV si el batch falla (reintentos seguros)', async () => {
    const { db } = mockDb();
    const failing = {
      ...db,
      batch() {
        return Promise.reject(new Error('D1 down'));
      },
    } as unknown as D1DatabaseLike;
    const kvDelete: string[] = [];
    await expect(
      persistBootstrap(
        failing,
        () => Promise.resolve(),
        (k) => {
          kvDelete.push(k);
          return Promise.resolve();
        },
        input(),
      ),
    ).rejects.toThrow('D1 down');
    expect(kvDelete).toEqual(['tenant:t_bootstrap']);
  });

  it('series por tipo de documento habilitado (NV interna; 01/03 pendientes SUNAT)', () => {
    expect(seriesSeedFor('NV')).toEqual({ series: 'NV01', status: 'INTERNAL' });
    expect(seriesSeedFor('01')).toEqual({ series: 'F001', status: 'PENDING_SUNAT' });
    expect(seriesSeedFor('03')).toEqual({ series: 'B001', status: 'PENDING_SUNAT' });
  });

  it('snapshot de auth coincide con mapTenantRow del plano de control', () => {
    const snap = JSON.parse(
      tenantAuthSnapshot({ tenantId: 't1', trialEndsAtIso: '2026-09-13T00:00:00.000Z' }),
    );
    expect(snap).toEqual({
      id: 't1',
      status: 'active',
      subscriptionStatus: 'trial',
      trialEndsAt: '2026-09-13T00:00:00.000Z',
    });
  });
});
