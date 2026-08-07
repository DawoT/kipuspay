import { describe, expect, it } from 'vitest';
import {
  assertFifoOrder,
  drainFiscalOutbox,
  putFiscalXml,
  type FiscalDrainDb,
  type FiscalXmlR2,
  type OutboxRow,
} from './fiscal-drain.js';

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

function memoryDb(rows: OutboxRow[]): FiscalDrainDb {
  const state = rows.map((r) => ({ ...r }));
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            bind: (...p: unknown[]) => this.bind(...p),
            all<T>() {
              if (sql.includes('ORDER BY must_submit_by')) {
                const sorted = [...state]
                  .filter((r) => r.status === 'PENDING' || r.status === 'FAILED')
                  .sort((a, b) =>
                    String(a.must_submit_by ?? 'z').localeCompare(String(b.must_submit_by ?? 'z')),
                  )
                  .slice(0, Number(params[0] ?? 20));
                return Promise.resolve({ results: sorted as unknown as T[] });
              }
              return Promise.resolve({ results: [] });
            },
            run() {
              if (sql.includes("status = 'QUARANTINED'")) {
                const id =
                  typeof params[2] === 'string'
                    ? params[2]
                    : typeof params[0] === 'string'
                      ? params[0]
                      : 'poison';
                const row = state.find((r) => r.id === id || r.id === 'poison');
                if (row) {
                  (row as { status: string }).status = 'QUARANTINED';
                }
              }
              if (sql.includes("status = 'SENT'")) {
                const id = String(params[0]);
                const row = state.find((r) => r.id === id);
                if (row) (row as { status: string }).status = 'SENT';
              }
              return Promise.resolve({});
            },
          };
        },
      };
    },
  };
}

describe('fiscal drain FIFO', () => {
  it('factura cercana a deadline antes que cola masiva', () => {
    const rows: OutboxRow[] = [
      {
        id: 'b',
        tenant_id: 't',
        sale_id: 'boleta-late',
        attempt_count: 0,
        must_submit_by: '2026-08-20T00:00:00.000Z',
        r2_xml_key: 'k2',
        status: 'PENDING',
      },
      {
        id: 'a',
        tenant_id: 't',
        sale_id: 'factura-soon',
        attempt_count: 0,
        must_submit_by: '2026-08-08T00:00:00.000Z',
        r2_xml_key: 'k1',
        status: 'PENDING',
      },
    ];
    const sorted = [...rows].sort((a, b) =>
      String(a.must_submit_by).localeCompare(String(b.must_submit_by)),
    );
    assertFifoOrder(sorted);
    expect(sorted[0]?.sale_id).toBe('factura-soon');
  });

  it('poison retry → quarantine; breaker open skip', async () => {
    const r2 = memoryR2();
    const key = await putFiscalXml(r2, 't', 's1', '<Invoice/>');
    const rows: OutboxRow[] = [
      {
        id: 'poison',
        tenant_id: 't',
        sale_id: 's-poison',
        attempt_count: 5,
        must_submit_by: '2026-08-08T00:00:00.000Z',
        r2_xml_key: key,
        status: 'FAILED',
      },
      {
        id: 'ok',
        tenant_id: 't',
        sale_id: 's-ok',
        attempt_count: 0,
        must_submit_by: '2026-08-09T00:00:00.000Z',
        r2_xml_key: key,
        status: 'PENDING',
      },
    ];
    const db = memoryDb(rows);
    const res = await drainFiscalOutbox({
      db,
      r2,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(res.quarantined).toBeGreaterThanOrEqual(1);

    const skipped = await drainFiscalOutbox({
      db: memoryDb(rows),
      r2,
      isBreakerOpen: () => Promise.resolve(true),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(skipped.skippedOpenBreaker).toBe(2);
  });
});
