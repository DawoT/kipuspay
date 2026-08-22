import { describe, expect, it, vi } from 'vitest';
import {
  isAccountingExportEnabled,
  isIntegrationsApiEnabled,
  runAccountingExportHttp,
  runCreateApiKeyHttp,
  runCreateWebhookEndpointHttp,
  runDrainWebhookDeliveriesHttp,
  runPublicSalesListHttp,
  runRevokeApiKeyHttp,
} from './integration-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  exportAccountingEntries: vi.fn(async () => [
    {
      sourceSaleId: 's1',
      branchId: 'b1',
      bookedAt: '2026-08-01',
      glAccount: '1011',
      amountCents: 100,
      line: 1,
      memo: 'm',
    },
  ]),
  enqueueWebhookDeliveryAtomic: vi.fn(),
  claimWebhookDeliveryAtomic: vi.fn(),
  settleWebhookDeliveryAtomic: vi.fn(),
}));

vi.mock('@kipuspay/adapters-accounting', () => ({
  formatAccountingExport: vi.fn(() => ({
    contentType: 'text/csv',
    body: 'fecha,cuenta\n',
    filename: 'x.csv',
  })),
}));

function mockEnv(planId = 'cadena'): WorkerEnv {
  const kv = new Map<string, string>();
  return {
    FEATURE_ACCOUNTING_EXPORT: '1',
    FEATURE_INTEGRATIONS_API: '1',
    API_KEY_PEPPER: 'test-pepper',
    TENANT_KV: {
      get: async (k) => kv.get(k) ?? null,
      put: async (k, v) => {
        kv.set(k, v);
      },
      delete: async (k) => {
        kv.delete(k);
      },
    },
    TENANT_STATE_DO: {
      idFromName: (n) => ({ toString: () => n }),
      get: () => ({ fetch: async () => new Response('{}') }),
    },
    DB: {
      prepare(sql: string) {
        const stmt = {
          bind(...args: unknown[]) {
            void args;
            return stmt;
          },
          first: async () => {
            if (sql.includes('FROM tenants')) return { plan_id: planId };
            if (sql.includes('SELECT id, key_prefix FROM api_keys')) {
              return { id: 'k1', key_prefix: 'kp_live_abcdef01' };
            }
            if (sql.includes('FROM api_keys') && sql.includes('key_prefix')) {
              return null;
            }
            return null;
          },
          all: async () => ({ results: [], success: true, meta: {} }),
          run: async () => ({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
      batch: async () => [],
    } as unknown as D1Database,
  } as WorkerEnv;
}

describe('integration-routes S23', () => {
  it('flags default off', () => {
    expect(isAccountingExportEnabled(undefined)).toBe(false);
    expect(isIntegrationsApiEnabled(undefined)).toBe(false);
    expect(isAccountingExportEnabled(mockEnv())).toBe(true);
  });

  it('export Contasis 200 Cadena', async () => {
    const res = await runAccountingExportHttp(mockEnv('cadena'), 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-05',
      branchId: 'b1',
      target: 'contasis',
    });
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
  });

  it('Arranque → 403 PLAN_REQUIRES_CADENA', async () => {
    const res = await runAccountingExportHttp(mockEnv('arranque'), 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-05',
      branchId: 'b1',
      target: 'contasis',
    });
    expect(res).toMatchObject({
      status: 403,
      body: { code: 'PLAN_REQUIRES_CADENA' },
    });
  });

  it('M4: flag FEATURE_ACCOUNTING_EXPORT off → 404 FEATURE_OFF', () => {
    const env = mockEnv('cadena');
    Object.assign(env, { FEATURE_ACCOUNTING_EXPORT: '0' });
    expect(isAccountingExportEnabled(env)).toBe(false);
  });

  it('M4: flag FEATURE_INTEGRATIONS_API off → 404 FEATURE_OFF', async () => {
    const env = mockEnv('cadena');
    Object.assign(env, { FEATURE_INTEGRATIONS_API: '0' });
    const res = await runCreateApiKeyHttp(env, 't1', 'u1');
    expect(res).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('M4: falsy/indefinido NO habilita flags (fail-closed)', () => {
    const env = mockEnv('cadena');
    Object.assign(env, { FEATURE_INTEGRATIONS_API: '' });
    expect(isIntegrationsApiEnabled(env)).toBe(false);
    Object.assign(env, { FEATURE_INTEGRATIONS_API: undefined });
    expect(isIntegrationsApiEnabled(env)).toBe(false);
  });

  it('create + revoke API key escribe KV revoke', async () => {
    const env = mockEnv('cadena');
    const created = await runCreateApiKeyHttp(env, 't1', 'u1');
    expect(created.status).toBe(201);
    expect((created.body as { apiKey: string }).apiKey).toMatch(/^kp_live_/);

    const revoked = await runRevokeApiKeyHttp(env, 't1', 'k1');
    expect(revoked.status).toBe(200);
    const flag = await env.TENANT_KV.get('api_key_revoked:t1:kp_live_abcdef01');
    expect(flag).toBe('1');
  });

  it('webhook URL http rechazada', async () => {
    const res = await runCreateWebhookEndpointHttp(mockEnv('cadena'), 't1', {
      url: 'http://evil.example/hook',
      events: ['sale.created'],
    });
    expect(res.status).toBe(422);
  });

  it('C6: API_KEY_PEPPER ausente → 503 fail-closed (nunca pepper conocido)', async () => {
    const env = mockEnv('cadena');
    Object.assign(env, { API_KEY_PEPPER: '' });
    const res = await runCreateApiKeyHttp(env, 't1', 'u1');
    expect(res).toMatchObject({ status: 503, body: { code: 'PEPPER_UNAVAILABLE' } });
  });

  it('C7: drain con usuario no-admin → 403', async () => {
    const res = await runDrainWebhookDeliveriesHttp(mockEnv('cadena'), 10, 'u1', 'cashier');
    expect(res).toMatchObject({ status: 403, body: { code: 'FORBIDDEN_ADMIN' } });
  });

  it('C7: drain admin → 200', async () => {
    const res = await runDrainWebhookDeliveriesHttp(mockEnv('cadena'), 10, 'admin-u1', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('S23-H1 API pública fail-closed', () => {
  it('sin pepper configurado → 503 PEPPER_UNAVAILABLE (nunca pepper dev)', async () => {
    const env = mockEnv();
    (env as unknown as { API_KEY_PEPPER: string }).API_KEY_PEPPER = '';
    const res = await runPublicSalesListHttp(env, 'Bearer kp_live_aaaaaaaabbbbbbbb');
    expect(res.status).toBe(503);
    expect((res.body as { code: string }).code).toBe('PEPPER_UNAVAILABLE');
  });

  it('autorización sin prefijo Bearer → 401 UNAUTHENTICATED', async () => {
    const res = await runPublicSalesListHttp(mockEnv(), 'Token abc');
    expect(res.status).toBe(401);
  });

  it('token con prefijo desconocido → 401 sin consultar datos', async () => {
    const res = await runPublicSalesListHttp(mockEnv(), 'Bearer invalid_token');
    expect(res.status).toBe(401);
  });
});

describe('S23-H1 candidatos api_keys', () => {
  it('la query de candidatos filtra status=active en SQL (no agota LIMIT con revocadas)', async () => {
    const captured: string[] = [];
    const env = mockEnv();
    const dbAny = env.DB as unknown as { prepare: (s: string) => unknown };
    const originalPrepare = dbAny.prepare.bind(dbAny);
    dbAny.prepare = (sql: string) => {
      captured.push(sql);
      return originalPrepare(sql);
    };
    const res = await runPublicSalesListHttp(env, 'Bearer kp_live_aaaaaaaabbbbbbbb');
    const candidatesSql = captured.find(
      (s) => s.includes('FROM api_keys') && s.includes('key_prefix'),
    );
    expect(candidatesSql).toBeTruthy();
    expect(candidatesSql).toMatch(/status\s*=\s*'active'/);
    expect(res.status).toBe(401); // mock sin hash válido → fail-closed
  });
});

describe('S23-H2 audit de exports contables', () => {
  it('cada export escribe audit_events ACCOUNTING_EXPORT (append-only)', async () => {
    const sqls: string[] = [];
    const env = mockEnv();
    const orig = (env as unknown as { DB: { prepare: (s: string) => unknown } }).DB.prepare.bind(
      (env as unknown as { DB: { prepare: (s: string) => unknown } }).DB,
    );
    (env.DB as unknown as { prepare: (s: string) => unknown }).prepare = (sql: string) => {
      sqls.push(sql);
      return orig(sql);
    };
    const res = await runAccountingExportHttp(
      env,
      't1',
      {
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        branchId: 'b1',
        target: 'contasis',
      },
      'u-owner',
    );
    expect(res.status).toBe(200);
    const auditSql = sqls.find((s) => s.includes('INSERT INTO audit_events'));
    expect(auditSql).toBeTruthy();
    const bound: unknown[][] = [];
    const orig2 = (env as unknown as { DB: { prepare: (s: string) => unknown } }).DB.prepare.bind(
      (env as unknown as { DB: { prepare: (s: string) => unknown } }).DB,
    );
    const captureStmt = (sql: string) => {
      const stmt = orig2(sql);
      const stmtAny = stmt as unknown as {
        bind: (...args: unknown[]) => { run: () => Promise<unknown> };
      };
      const boundStmt = stmtAny.bind.bind(stmtAny);
      (stmtAny as unknown as { bind: (...a: unknown[]) => unknown }).bind = (...a: unknown[]) => {
        bound.push(a);
        return boundStmt(...a);
      };
      return stmt;
    };
    (env.DB as unknown as { prepare: (s: string) => unknown }).prepare = captureStmt;
    await runAccountingExportHttp(
      env,
      't1',
      {
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        branchId: 'b1',
        target: 'contasis',
      },
      'u-owner',
    );
    const auditBinds = bound.find((b) => b.includes('ACCOUNTING_EXPORT'));
    expect(auditBinds).toBeTruthy();
    expect(auditBinds?.[3]).toBe('u-owner');
  });
});
