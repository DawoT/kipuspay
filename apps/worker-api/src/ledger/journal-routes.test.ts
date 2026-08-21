import { describe, expect, it } from 'vitest';
import { runListJournalHttp, runMutateJournalHttp } from './journal-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function env(): WorkerEnv {
  return {
    FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1',
    DB: {
      prepare() {
        const stmt = {
          bind() {
            return stmt;
          },
          first: () => Promise.resolve(null),
          all: () =>
            Promise.resolve({
              results: [{ id: 'j1', account_code: '1011' }],
              success: true,
              meta: {},
            }),
          run: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
}

interface BindCapture {
  sql: string;
  args: unknown[];
}

/** D1 que graba cada prepare/bind (spy de bindings, SEC-01/SEC-04). */
function envWithBindCapture(): { env: WorkerEnv; calls: BindCapture[] } {
  const calls: BindCapture[] = [];
  const stmt = {
    bind(...args: unknown[]) {
      calls[calls.length - 1]!.args = args;
      return stmt;
    },
    first: () => Promise.resolve(null),
    all: () =>
      Promise.resolve({
        results: [{ id: 'j1', account_code: '1011' }],
        success: true,
        meta: {},
      }),
    run: () => Promise.resolve({ results: [], success: true, meta: {} }),
  };
  const env = {
    FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1',
    DB: {
      prepare(sql: string) {
        calls.push({ sql, args: [] });
        return stmt;
      },
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
  return { env, calls };
}

/**
 * D1 con semántica de valores literales (SEC-04): los parámetros bind se
 * comparan como strings exactos, jamás se interpretan como SQL. Un payload de
 * inyección (espacios, comillas, `;`, `--`, `UNION`, …) no matchea ninguna fila
 * → 0 resultados, igual que SQLite con una columna bindeada.
 */
function literalDbEnv(): { env: WorkerEnv; sqls: string[]; bound: unknown[][] } {
  const sqls: string[] = [];
  const bound: unknown[][] = [];
  /** Literales seguros: IDs de tenant/branch e ISO dates (2026-08-01, b1, t1). */
  const SAFE_LITERAL = /^[\w./:-]+$/;
  const env = {
    FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1',
    DB: {
      prepare(sql: string) {
        sqls.push(sql);
        return {
          bind(...args: unknown[]) {
            bound.push(args);
            return this;
          },
          first: () => Promise.resolve(null),
          all: () => {
            const args = bound[bound.length - 1] ?? [];
            const allSafe = args.every(
              (v) => typeof v === 'string' && SAFE_LITERAL.test(v),
            );
            return Promise.resolve({
              results: allSafe ? [{ id: 'j1', account_code: '1011' }] : [],
              success: true,
              meta: {},
            });
          },
          run: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
      },
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
  return { env, sqls, bound };
}

describe('journal routes', () => {
  it('GET lists entries when flag on', async () => {
    const res = await runListJournalHttp(env(), 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      branchId: 'b1',
    });
    expect(res.status).toBe(200);
    expect((res.body.items as unknown[]).length).toBe(1);
  });

  it('POST/PATCH journal is forbidden', () => {
    expect(runMutateJournalHttp().status).toBe(403);
    expect(runMutateJournalHttp().body.code).toBe('JOURNAL_READ_ONLY');
  });

  it('404 when flag off', async () => {
    const res = await runListJournalHttp(
      { FEATURE_LEDGER_CHART_OF_ACCOUNTS: '0' } as unknown as WorkerEnv,
      't1',
      {
        fromDate: '2026-08-01',
        toDate: '2026-08-07',
        branchId: 'b1',
      },
    );
    expect(res.status).toBe(404);
  });

  it('503 without DB and 400 without range', async () => {
    const noDb = await runListJournalHttp(
      { FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1' } as unknown as WorkerEnv,
      't1',
      { fromDate: '2026-08-01', toDate: '2026-08-07', branchId: 'b1' },
    );
    expect(noDb.status).toBe(503);
    const bad = await runListJournalHttp(env(), 't1', { fromDate: '', toDate: '', branchId: '' });
    expect(bad.status).toBe(400);
  });

  it('SEC-01: 401 fail-closed cuando tenantId falta o es vacío (sin tenant no hay query)', async () => {
    const params = { fromDate: '2026-08-01', toDate: '2026-08-07', branchId: 'b1' };
    const missing = await runListJournalHttp(env(), '', params);
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');
    const undef = await runListJournalHttp(env(), undefined as unknown as string, params);
    expect(undef.status).toBe(401);
    expect(undef.body.code).toBe('UNAUTHORIZED');
  });

  it('SEC-01/SEC-04: spy de bindings — tenant_id es SIEMPRE el primer parámetro bind, nunca interpola el query', async () => {
    const { env: capturedEnv, calls } = envWithBindCapture();
    const res = await runListJournalHttp(capturedEnv, 'tenant-A', {
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      branchId: 'b1',
    });
    expect(res.status).toBe(200);
    expect(calls.length).toBe(1);
    const { sql, args } = calls[0]!;
    // El filtro multitenant vive en el SQL con placeholder, no por concatenación.
    expect(sql).toContain('je.tenant_id = ?');
    expect(args).toEqual(['tenant-A', 'b1', '2026-08-01', '2026-08-07']);
    // Nada del query (branch/fromDate/toDate) ni del tenant llega interpolado al SQL.
    expect(sql).not.toContain('tenant-A');
    expect(sql).not.toContain('b1');
    expect(sql).not.toContain('2026-08-01');
  });

  it('SEC-01/SEC-04: tenant ajeno — mismo query con otro tenant produce SQL idéntico y difiere SOLO en el binding', async () => {
    const a = envWithBindCapture();
    const b = envWithBindCapture();
    const params = { fromDate: '2026-08-01', toDate: '2026-08-07', branchId: 'b1' };
    await runListJournalHttp(a.env, 'tenant-A', params);
    await runListJournalHttp(b.env, 'tenant-B', params);
    // El texto SQL es el mismo en ambos: el aislamiento lo da el filtro WHERE
    // je.tenant_id = ? con el valor bindeado, no un SQL distinto por caller.
    expect(a.calls[0]!.sql).toBe(b.calls[0]!.sql);
    expect(a.calls[0]!.args[0]).toBe('tenant-A');
    expect(b.calls[0]!.args[0]).toBe('tenant-B');
    expect(a.calls[0]!.args.slice(1)).toEqual(b.calls[0]!.args.slice(1));
  });

  it('US-04 acceptance: `x\' OR 1=1 --` como idempotencyKey y \u202E como metadata llegan SOLO por bind a prepare(?)', async () => {
    const idempotencyKey = "x' OR 1=1 --";
    const rtlMetadata = 'b1\u202E'; // RIGHT-TO-LEFT OVERRIDE (U+202E) embebido
    const { env: envKey, calls: callsKey } = envWithBindCapture();
    const resKey = await runListJournalHttp(envKey, 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      branchId: idempotencyKey,
    });
    expect(resKey.status).toBe(200);
    expect(callsKey.length).toBe(1);
    // prepare recibió '?': el WHERE lleva el placeholder, jamás el literal.
    expect(callsKey[0]!.sql).toContain('je.tenant_id = ?');
    expect(callsKey[0]!.sql).toContain('je.branch_id = ?');
    expect(callsKey[0]!.sql).toContain('date(?)');
    // El payload de inyección va por bind (args), no interpolado en el SQL.
    expect(callsKey[0]!.sql).not.toContain(idempotencyKey);
    expect(callsKey[0]!.args).toContain(idempotencyKey);

    const { env: envMeta, calls: callsMeta } = envWithBindCapture();
    const resMeta = await runListJournalHttp(envMeta, 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      branchId: rtlMetadata,
    });
    expect(resMeta.status).toBe(200);
    expect(callsMeta[0]!.sql).not.toContain('\u202E');
    expect(callsMeta[0]!.args).toContain(rtlMetadata);
  });

  it('SEC-04: inyección SQL en branchId/fromDate/toDate → 0 filas y NUNCA 500 (parámetros literales)', async () => {
    const payloads: Array<[string, string, string]> = [
      // branchId
      ["b1' OR '1'='1", '2026-08-01', '2026-08-07'],
      ['b1" OR 1=1 --', '2026-08-01', '2026-08-07'],
      ['b1 OR 1=1', '2026-08-01', '2026-08-07'],
      ['b1; DROP TABLE journal_entries; --', '2026-08-01', '2026-08-07'],
      // Acceptance US-04: payload exacto de idempotencyKey y RTL-override
      // (\u202E) como metadata — siguen siendo literales, jamás SQL.
      ["x' OR 1=1 --", '2026-08-01', '2026-08-07'],
      ['b1\u202E', '2026-08-01', '2026-08-07'],
      // fromDate
      ['b1', "2026-08-01' OR '1'='1", '2026-08-07'],
      ['b1', '2026-08-01" OR 1=1 --', '2026-08-07'],
      ['b1', "2026-08-01' UNION SELECT id, secret FROM users --", '2026-08-07'],
      ['b1', '2026-08-01\u202E', '2026-08-07'],
      // toDate
      ['b1', '2026-08-01', "2026-08-07' OR '1'='1"],
      ['b1', '2026-08-01', "2026-08-07'); DELETE FROM chart_of_accounts; --"],
      ['b1', '2026-08-01', '2026-08-07 UNION SELECT tenant_id, secret FROM users --'],
      ['b1', '2026-08-01', '2026-08-07\u202E'],
    ];
    for (const [branchId, fromDate, toDate] of payloads) {
      const { env: injEnv, sqls } = literalDbEnv();
      // Sin try/catch en el route: si el payload rompiera la query (SQL
      // interpolado), esto lanzaría y el test fallaría — 500 jamás es opción.
      const res = await runListJournalHttp(injEnv, 't1', { fromDate, toDate, branchId });
      expect(res.status).toBe(200);
      expect((res.body.items as unknown[]).length).toBe(0); // 0 filas: literal, no matchea
      // El payload jamás se interpola en el SQL: solo existe como valor bind.
      for (const sql of sqls) {
        expect(sql).not.toContain(branchId);
        expect(sql).not.toContain(fromDate);
        expect(sql).not.toContain(toDate);
      }
    }
  });
});
