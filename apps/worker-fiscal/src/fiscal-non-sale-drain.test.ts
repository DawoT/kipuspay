import { describe, expect, it } from 'vitest';
import type { FiscalTransport } from '@kipuspay/adapters-sunat';
import { drainFiscalNonSaleOutbox } from './fiscal-non-sale-drain.js';
import type { FiscalDrainDb, FiscalXmlR2 } from './fiscal-drain.js';
import type { NonSaleOutboxRow } from './fiscal-non-sale-drain.js';

function memoryR2(): FiscalXmlR2 & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    put: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    get: (k) => {
      const v = map.get(k);
      if (v === undefined) return Promise.resolve(null);
      return Promise.resolve({ text: () => Promise.resolve(v) });
    },
  };
}

type MockRow = NonSaleOutboxRow & { next_attempt_at: string };

function memoryDb(rows: MockRow[]): FiscalDrainDb & { state: MockRow[]; sql: string[] } {
  const state = rows;
  const sqlLog: string[] = [];
  const impl = (sql: string, params: unknown[]) => ({
    all<T>() {
      sqlLog.push(sql);
      if (sql.includes('SELECT r2_xml_key')) {
        const row = state.find((r) => r.id === String(params[0]));
        return Promise.resolve({
          results: row ? ([{ r2_xml_key: row.r2_xml_key }] as T[]) : [],
        });
      }
      if (sql.includes("status = 'PROCESSING'")) {
        return Promise.resolve({
          results: state.filter((r) => r.status === 'PROCESSING') as unknown as T[],
        });
      }
      return Promise.resolve({ results: [] });
    },
    run() {
      sqlLog.push(sql);
      if (sql.includes("SET status = 'PROCESSING'")) {
        let claimed = 0;
        const limit = Number(params[1] ?? 20);
        for (const row of state) {
          if (row.status === 'PENDING' || row.status === 'FAILED') {
            if (claimed >= limit) break;
            row.status = 'PROCESSING';
            claimed += 1;
          }
        }
        return Promise.resolve({ success: true, meta: { changes: claimed } });
      }
      const id = String(params[0] ?? '');
      const row = state.find((r) => r.id === id || r.entity_id === id);
      if (row) {
        if (sql.includes("status = 'SENT'")) row.status = 'SENT';
        if (sql.includes("status = 'QUARANTINED'")) row.status = 'QUARANTINED';
        if (sql.includes("status = 'FAILED'")) row.status = 'FAILED';
      }
      return Promise.resolve({ success: true, meta: { changes: 1 } });
    },
  });
  const chainable = (sql: string) => {
    const bound = (params: unknown[]) => ({
      ...impl(sql, params),
      bind: (...p: unknown[]) => bound(p),
    });
    return {
      bind: (...p: unknown[]) => bound(p),
      all: <T>() => impl(sql, []).all<T>(),
      run: () => impl(sql, []).run(),
    };
  };
  return {
    state,
    sql: sqlLog,
    prepare(sql: string) {
      return chainable(sql);
    },
  };
}

const signedGre = '<DespatchAdvice><ds:Signature>x</ds:Signature></DespatchAdvice>';

describe('drainFiscalNonSaleOutbox', () => {
  it('canal live + XML sin firma → QUARANTINED, 0 ACCEPTED', async () => {
    const r2 = memoryR2();
    r2.map.set('k', '<DespatchAdvice/>');
    const db = memoryDb([
      {
        id: 'o1',
        tenant_id: 't',
        document_type: '31',
        entity_id: 'g1',
        attempt_count: 0,
        r2_xml_key: 'k',
        status: 'PENDING',
        next_attempt_at: new Date().toISOString(),
      },
    ]);
    let submits = 0;
    const transport: FiscalTransport = {
      mode: 'KIPUSPAY_PSE_DIRECT',
      submit: () => {
        submits += 1;
        return Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true },
        });
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'ok', accepted: true }),
    };
    const res = await drainFiscalNonSaleOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(res.accepted).toBe(0);
    expect(submits).toBe(0);
    expect(db.state[0]?.status).toBe('QUARANTINED');
  });

  it('XML firmado GRE 31 + CDR accepted → SENT', async () => {
    const r2 = memoryR2();
    r2.map.set('k', signedGre);
    const db = memoryDb([
      {
        id: 'o2',
        tenant_id: 't',
        document_type: '31',
        entity_id: 'g2',
        attempt_count: 0,
        r2_xml_key: 'k',
        status: 'PENDING',
        next_attempt_at: new Date().toISOString(),
      },
    ]);
    const transport: FiscalTransport = {
      mode: 'KIPUSPAY_PSE_DIRECT',
      submit: (req) => {
        expect(req.documentType).toBe('31');
        return Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true },
        });
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'ok', accepted: true }),
    };
    const res = await drainFiscalNonSaleOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(res.accepted).toBe(1);
    expect(db.state[0]?.status).toBe('SENT');
    expect(db.sql.some((s) => s.includes('UPDATE remission_guides'))).toBe(true);
  });
});
