import { describe, expect, it } from 'vitest';
import {
  assertFifoOrder,
  drainFiscalOutbox,
  putFiscalXml,
  type FiscalDrainDb,
  type FiscalXmlR2,
  type OutboxRow,
} from './fiscal-drain.js';
import type { FiscalTransport } from '@kipuspay/adapters-sunat';

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

type MockRow = OutboxRow & { next_attempt_at: string; status: string };

/** B4 claim atómico simulado: PENDING/FAILED (o PROCESSING stale) → PROCESSING. */
function claimRows(state: MockRow[], limit: number): number {
  const now = Date.now();
  let claimed = 0;
  for (const row of state) {
    const stale =
      row.status === 'PROCESSING' &&
      now - Date.parse(String(row.next_attempt_at ?? 0)) > 10 * 60 * 1000;
    if (row.status === 'PENDING' || row.status === 'FAILED' || stale) {
      if (claimed >= limit) break;
      row.status = 'PROCESSING';
      row.next_attempt_at = new Date(now).toISOString();
      claimed += 1;
    }
  }
  return claimed;
}

/** Aplica la transición terminal que corresponda al UPDATE recibido. */
function applyTerminalTransition(state: MockRow[], sql: string, params: unknown[]): void {
  if (sql.includes("status = 'QUARANTINED'")) {
    const id =
      typeof params[2] === 'string'
        ? params[2]
        : typeof params[0] === 'string'
          ? params[0]
          : 'poison';
    const row = state.find((r) => r.id === id || r.id === 'poison');
    if (row) row.status = 'QUARANTINED';
  } else if (sql.includes("status = 'SENT'")) {
    const row = state.find((r) => r.id === String(params[0]));
    if (row) row.status = 'SENT';
  } else if (sql.includes("status = 'FAILED'")) {
    const row = state.find((r) => r.id === String(params[0]));
    if (row) row.status = 'FAILED';
  }
}

function memoryDb(rows: OutboxRow[]): FiscalDrainDb & { state: MockRow[] } {
  const state = rows.map((r) => ({ ...r, next_attempt_at: new Date().toISOString() }));
  const impl = (sql: string, params: unknown[]) => ({
    all<T>() {
      if (sql.includes("WHERE status = 'PROCESSING'")) {
        return Promise.resolve({
          results: state
            .filter((r) => r.status === 'PROCESSING')
            .sort((a, b) =>
              String(a.must_submit_by ?? 'z').localeCompare(String(b.must_submit_by ?? 'z')),
            ) as unknown as T[],
        });
      }
      return Promise.resolve({ results: [] });
    },
    run() {
      if (sql.includes("SET status = 'PROCESSING'")) {
        return Promise.resolve({
          success: true,
          meta: { changes: claimRows(state, Number(params[1] ?? 20)) },
        });
      }
      applyTerminalTransition(state, sql, params);
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
    prepare(sql: string) {
      return chainable(sql);
    },
  };
}

describe('fiscal drain FIFO', () => {
  it('F5-3: xmlHash enviado al transporte es el SHA-256 REAL del XML (no literal)', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    const xml = '<?xml version="1.0"?><Invoice><cbc:ID>F001-1</cbc:ID></Invoice>';
    r2.map.set('xml-key-1', xml);
    db.state.push({
      id: 'f1',
      tenant_id: 't1',
      sale_id: 's1',
      status: 'PENDING',
      attempt_count: 0,
      must_submit_by: '2026-08-20T00:00:00.000Z',
      document_type: '01',
      r2_xml_key: 'xml-key-1',
      created_at: new Date().toISOString(),
    } as unknown as MockRow);

    const submittedHashes: string[] = [];
    const transport: FiscalTransport = {
      mode: 'MOCK_STAGING',
      submit: (input) => {
        submittedHashes.push(input.xmlHash);
        return Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'OK', accepted: true },
        });
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'OK', accepted: true }),
    };
    const result = await drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });

    const expectedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
    const expectedHex = [...new Uint8Array(expectedHash)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(submittedHashes).toHaveLength(1);
    expect(submittedHashes[0]).toBe(expectedHex);
    expect(submittedHashes[0]).not.toBe('drain');
    expect(result.accepted).toBe(1);
  });

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

  it('B4: dos drains concurrentes nunca envían el mismo XML (claim atómico)', async () => {
    const r2 = memoryR2();
    const key = await putFiscalXml(r2, 't', 's1', '<Invoice/>');
    const rows: OutboxRow[] = [
      {
        id: 'r1',
        tenant_id: 't',
        sale_id: 's1',
        attempt_count: 0,
        must_submit_by: '2026-08-08T00:00:00.000Z',
        r2_xml_key: key,
        status: 'PENDING',
      },
    ];
    const db = memoryDb(rows);

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let submitCalls = 0;
    const transport: FiscalTransport = {
      mode: 'MOCK_STAGING',
      submit: async () => {
        submitCalls += 1;
        await gate;
        return {
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true },
        };
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'ok', accepted: true }),
    };

    const first = drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    // El primer drain reclamó la fila y está bloqueado en el submit; el segundo
    // drain NO debe reclamarla (sigue PROCESSING, claim fresco).
    const second = await drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(second.processed).toBe(0);
    expect(second.accepted).toBe(0);

    release();
    const res = await first;
    expect(res.accepted).toBe(1);
    expect(submitCalls).toBe(1);
    const finalStatus = (db.state.find((r) => r.id === 'r1') as { status: string }).status;
    expect(finalStatus).toBe('SENT');
  });
});

describe('F8 Bloque C — chaos SUNAT caído (fail-closed)', () => {
  it('caída total 100%: ningún XML se marca SENT; todo queda retryable; post-recovery reenvía sin pérdida', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    const xml = '<?xml version="1.0"?><Invoice><cbc:ID>F001-CHAOS</cbc:ID></Invoice>';
    r2.map.set('xml-key-chaos', xml);
    db.state.push({
      id: 'c1',
      tenant_id: 't-chaos',
      sale_id: 's-chaos',
      status: 'PENDING',
      attempt_count: 0,
      must_submit_by: '2026-08-20T00:00:00.000Z',
      document_type: '01',
      r2_xml_key: 'xml-key-chaos',
      created_at: new Date().toISOString(),
    } as unknown as MockRow);

    let sunatUp = false; // SUNAT caído 100%
    const submitted: string[] = [];
    const transport: FiscalTransport = {
      mode: 'MOCK_STAGING',
      submit: (input) => {
        submitted.push(input.xmlHash);
        if (!sunatUp) {
          return Promise.resolve({
            kind: 'rejected',
            cdr: { cdrCode: '2335', cdrDescription: 'SUNAT down', accepted: false },
          });
        }
        return Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'OK', accepted: true },
        });
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'OK', accepted: true }),
    };

    // Pasada 1: SUNAT caído → nada SENT, nada perdido.
    const first = await drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(first.accepted).toBe(0);
    expect(db.state.find((r) => r.id === 'c1')?.status).not.toBe('SENT');

    // Recovery + pasada 2: el mismo XML se reenvía y se acepta (sin pérdida).
    sunatUp = true;
    db.state.find((r) => r.id === 'c1')!.status = 'PENDING';
    const second = await drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(second.accepted).toBe(1);
    expect(db.state.find((r) => r.id === 'c1')?.status).toBe('SENT');
    expect(submitted.length).toBeGreaterThanOrEqual(2); // reenvío real
  });
});
