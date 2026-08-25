import { describe, expect, it } from 'vitest';
import { SunatChannelError } from '@kipuspay/adapters-sunat';
import {
  assertFifoOrder,
  drainFiscalOutbox,
  putFiscalXml,
  unitaryCdrReceiptKey,
  xmlReadyForLiveSubmit,
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
function applyTerminalTransition(
  state: MockRow[],
  sentCdrKeys: Map<string, string | null>,
  sql: string,
  params: unknown[],
): void {
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
    // H3-c: bind(cdrKey|null, id, tenantId) — la referencia viaja con el SENT.
    const id = String(params[1]);
    const row = state.find((r) => r.id === id);
    if (row) {
      row.status = 'SENT';
      sentCdrKeys.set(id, params[0] === null ? null : String(params[0]));
    }
  } else if (sql.includes("SET status = 'PENDING'")) {
    const row = state.find((r) => r.id === String(params[0]));
    if (row) row.status = 'PENDING';
  } else if (sql.includes("status = 'FAILED'")) {
    const row = state.find((r) => r.id === String(params[0]));
    if (row) row.status = 'FAILED';
  }
}

function memoryDb(rows: OutboxRow[]): FiscalDrainDb & {
  state: MockRow[];
  sales: Map<string, string>;
  sentCdrKeys: Map<string, string | null>;
} {
  const state = rows.map((r) => ({ ...r, next_attempt_at: new Date().toISOString() }));
  const sales = new Map<string, string>();
  const sentCdrKeys = new Map<string, string | null>();
  const impl = (sql: string, params: unknown[]) => ({
    all<T>() {
      if (sql.includes("f.status = 'PROCESSING'")) {
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
      if (sql.includes('UPDATE sales SET sunat_status')) {
        const outboxId = String(params[3]);
        const tenantId = String(params[2]);
        const row = state.find((r) => r.id === outboxId && r.tenant_id === tenantId);
        if (row?.status === 'PROCESSING') {
          sales.set(`${String(params[1])}:${tenantId}`, String(params[0]));
        }
        return Promise.resolve({
          success: true,
          meta: { changes: row?.status === 'PROCESSING' ? 1 : 0 },
        });
      }
      applyTerminalTransition(state, sentCdrKeys, sql, params);
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
    sales,
    sentCdrKeys,
    prepare(sql: string) {
      return chainable(sql);
    },
  };
}

describe('fiscal drain FIFO', () => {
  it('xmlReadyForLiveSubmit: mock acepta XML no vacío; live exige firma + root UBL', () => {
    expect(xmlReadyForLiveSubmit('<Invoice/>', 'MOCK_STAGING')).toBe(true);
    expect(xmlReadyForLiveSubmit('<Invoice/>', 'KIPUSPAY_PSE_DIRECT')).toBe(false);
    expect(xmlReadyForLiveSubmit('<Invoice><ds:Signature/></Invoice>', 'sunat_bill_beta')).toBe(
      true,
    );
    expect(xmlReadyForLiveSubmit('<Invoice><ds:Signature/></Invoice>', 'MISCONFIGURED')).toBe(
      false,
    );
  });

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
    expect(db.sales.get('s1:t1')).toBe('ACCEPTED');
    expect(db.state.find((r) => r.id === 'f1')?.status).toBe('SENT');
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
        document_type: '01',
      },
      {
        id: 'ok',
        tenant_id: 't',
        sale_id: 's-ok',
        attempt_count: 0,
        must_submit_by: '2026-08-09T00:00:00.000Z',
        r2_xml_key: key,
        status: 'PENDING',
        document_type: '01',
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
        document_type: '01',
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

  it('C6: boleta (canal RC) se salta del drain y vuelve a PENDING — jamás XML unitario', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    r2.map.set('boleta-key', '<Invoice/>');
    db.state.push({
      id: 'b1',
      tenant_id: 't',
      sale_id: 's-boleta',
      status: 'PENDING',
      attempt_count: 0,
      must_submit_by: '2026-08-20T00:00:00.000Z',
      document_type: '03',
      r2_xml_key: 'boleta-key',
      created_at: new Date().toISOString(),
    } as unknown as MockRow);

    let submitCalls = 0;
    const transport: FiscalTransport = {
      mode: 'MOCK_STAGING',
      submit: () => {
        submitCalls += 1;
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
    expect(result.skippedRc).toBe(1);
    expect(result.accepted).toBe(0);
    expect(submitCalls).toBe(0);
    expect(db.state.find((r) => r.id === 'b1')?.status).toBe('PENDING');
  });

  // H1 (auditoría 0031): NC/ND sobre boleta viajan por el RC, no como XML
  // unitario. El drain las reclama, clasifica canal RC vía referenced doc y
  // las libera a PENDING para que el cron del Resumen Diario las entregue.
  it.each([
    ['07', 'NC'],
    ['08', 'ND'],
  ] as const)(
    'H1: %s sobre boleta (ref 03) → SKIP_RC liberada a PENDING para el cron RC',
    async (docType) => {
      const db = memoryDb([]);
      const r2 = memoryR2();
      db.state.push({
        id: `note-${docType}`,
        tenant_id: 't',
        sale_id: `s-note-${docType}`,
        status: 'PENDING',
        attempt_count: 0,
        must_submit_by: '2026-08-20T00:00:00.000Z',
        document_type: docType,
        referenced_document_type: '03',
        created_at: new Date().toISOString(),
      } as unknown as MockRow);

      let submitCalls = 0;
      const transport: FiscalTransport = {
        mode: 'MOCK_STAGING',
        submit: () => {
          submitCalls += 1;
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
      expect(result.skippedRc).toBe(1);
      expect(result.accepted).toBe(0);
      expect(submitCalls).toBe(0);
      expect(db.state.find((r) => r.id === `note-${docType}`)?.status).toBe('PENDING');
    },
  );

  it('canal live + XML sin ds:Signature → QUARANTINED, 0 ACCEPTED', async () => {
    const r2 = memoryR2();
    const key = await putFiscalXml(r2, 't', 's1', '<Invoice><cbc:ID>F001-1</cbc:ID></Invoice>');
    const db = memoryDb([
      {
        id: 'u1',
        tenant_id: 't',
        sale_id: 's1',
        attempt_count: 0,
        must_submit_by: '2026-08-08T00:00:00.000Z',
        r2_xml_key: key,
        status: 'PENDING',
        document_type: '01',
      },
    ]);
    let submitCalls = 0;
    const transport: FiscalTransport = {
      mode: 'KIPUSPAY_PSE_DIRECT',
      submit: () => {
        submitCalls += 1;
        return Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true },
        });
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'ok', accepted: true }),
    };
    const res = await drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(res.accepted).toBe(0);
    expect(res.quarantined).toBe(1);
    expect(submitCalls).toBe(0);
  });

  it('NC 07 firmada en canal live se envía (FL-3 software)', async () => {
    const r2 = memoryR2();
    const key = await putFiscalXml(
      r2,
      't',
      'nc1',
      '<CreditNote><ds:Signature>x</ds:Signature></CreditNote>',
    );
    const db = memoryDb([
      {
        id: 'n1',
        tenant_id: 't',
        sale_id: 'nc1',
        attempt_count: 0,
        must_submit_by: '2026-08-08T00:00:00.000Z',
        r2_xml_key: key,
        status: 'PENDING',
        document_type: '07',
        referenced_document_type: '01',
      },
    ]);
    const types: string[] = [];
    const transport: FiscalTransport = {
      mode: 'KIPUSPAY_PSE_DIRECT',
      submit: (req) => {
        types.push(req.documentType);
        return Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true },
        });
      },
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'ok', accepted: true }),
    };
    const res = await drainFiscalOutbox({
      db,
      r2,
      transport,
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });
    expect(res.accepted).toBe(1);
    expect(types).toEqual(['07']);
  });

  it('C6: fila sin r2_xml_key → self-healing produce XML y luego se envía', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    db.state.push({
      id: 'h1',
      tenant_id: 't',
      sale_id: 's-orphan',
      status: 'PENDING',
      attempt_count: 0,
      must_submit_by: '2026-08-20T00:00:00.000Z',
      document_type: '01',
      r2_xml_key: null,
      created_at: new Date().toISOString(),
    } as unknown as MockRow);

    let produced = false;
    let submitCalls = 0;
    const transport: FiscalTransport = {
      mode: 'MOCK_STAGING',
      submit: () => {
        submitCalls += 1;
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
      produceMissingXml: () => {
        produced = true;
        r2.map.set('fiscal-xml/t/s-orphan.xml', '<Invoice/>');
        // el producer actualiza el outbox; simulamos el efecto en memoria
        const row = db.state.find((r) => r.id === 'h1');
        if (row) (row as { r2_xml_key: string | null }).r2_xml_key = 'fiscal-xml/t/s-orphan.xml';
        return Promise.resolve();
      },
    });

    expect(produced).toBe(true);
    expect(result.accepted).toBe(1);
    expect(submitCalls).toBe(1);
    expect(db.state.find((r) => r.id === 'h1')?.status).toBe('SENT');
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

describe('routing SOL por tenant — aislamiento de error de canal en el drain', () => {
  it('SunatChannelError de un tenant → QUARANTINED CHANNEL_ERROR; el resto del drain continúa', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    // Con firma XAdES simulada: el modo live exige firma para llegar al submit
    // (lo que se ejercita aquí es el aislamiento del error de canal, no XAdES).
    const xml = '<Invoice><ds:Signature/><cbc:ID>F001-1</cbc:ID></Invoice>';
    r2.map.set('xml-key-chan', xml);
    db.state.push(
      {
        id: 'chan',
        tenant_id: 't-sin-sol-prod',
        sale_id: 's-chan',
        status: 'PENDING',
        attempt_count: 0,
        must_submit_by: '2026-08-20T00:00:00.000Z',
        document_type: '01',
        r2_xml_key: 'xml-key-chan',
        created_at: new Date().toISOString(),
      } as unknown as MockRow,
      {
        id: 'okrow',
        tenant_id: 't-ok',
        sale_id: 's-ok',
        status: 'PENDING',
        attempt_count: 0,
        must_submit_by: '2026-08-21T00:00:00.000Z',
        document_type: '01',
        r2_xml_key: 'xml-key-chan',
        created_at: new Date().toISOString(),
      } as unknown as MockRow,
    );

    const transport: FiscalTransport = {
      mode: 'sunat_bill_production',
      submit: (input) => {
        if (input.tenantId === 't-sin-sol-prod') {
          return Promise.reject(new SunatChannelError('SUNAT_PRODUCTION_SOL_MISSING'));
        }
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

    // La fila del tenant sin SOL queda cuarentenada (visible, no INFRA silenciosa)…
    expect(db.state.find((r) => r.id === 'chan')?.status).toBe('QUARANTINED');
    expect(result.quarantined).toBe(1);
    expect(db.sales.get('s-chan:t-sin-sol-prod')).toBe('QUARANTINED');
    // …y la fila sana del otro tenant se emitió normalmente.
    expect(db.state.find((r) => r.id === 'okrow')?.status).toBe('SENT');
    expect(result.accepted).toBe(1);
  });
});

/**
 * H3 (auditoría 0031) — conservación SUNAT del CDR del XML unitario.
 * El drain es el único punto donde el envelope del CDR unitario está en mano;
 * hoy se pierde. Contrato: receipt JSON en `fiscal-cdr/<tenant>/<saleId>.json`
 * + referencia `fiscal_outbox.r2_cdr_key` en el MISMO UPDATE que marca SENT.
 * Best-effort: fallo de R2 NO revierte el ACCEPTED (warn + clave NULL).
 */
describe('H3-c — archivo del CDR unitario (receipt JSON + r2_cdr_key)', () => {
  function acceptedTransport(): FiscalTransport {
    return {
      mode: 'MOCK_STAGING',
      submit: () =>
        Promise.resolve({
          kind: 'accepted',
          cdr: { cdrCode: '0', cdrDescription: 'OK', accepted: true },
        }),
      queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'OK', accepted: true }),
    };
  }

  async function seedAcceptedRow(db: ReturnType<typeof memoryDb>, r2: ReturnType<typeof memoryR2>) {
    const xml = '<Invoice><ds:Signature/><cbc:ID>F001-9</cbc:ID></Invoice>';
    r2.map.set('xml-key-h3c', xml);
    db.state.push({
      id: 'h3c',
      tenant_id: 't-h3c',
      sale_id: 's-h3c',
      status: 'PENDING',
      attempt_count: 0,
      must_submit_by: '2026-08-20T00:00:00.000Z',
      document_type: '01',
      r2_xml_key: 'xml-key-h3c',
      created_at: new Date().toISOString(),
    } as unknown as MockRow);
  }

  it('accepted → receipt JSON en fiscal-cdr/<tenant>/<sale>.json + r2_cdr_key en el SENT', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    await seedAcceptedRow(db, r2);

    const result = await drainFiscalOutbox({
      db,
      r2,
      transport: acceptedTransport(),
      isBreakerOpen: () => Promise.resolve(false),
      onInfraFailure: () => Promise.resolve(),
    });

    expect(result.accepted).toBe(1);
    const key = unitaryCdrReceiptKey('t-h3c', 's-h3c');
    expect(key).toBe('fiscal-cdr/t-h3c/s-h3c.json');
    expect(r2.map.has(key)).toBe(true);
    const receipt = JSON.parse(r2.map.get(key) as string) as {
      kind: string;
      saleId: string;
      tenantId: string;
      cdrCode: string;
      accepted: boolean;
    };
    expect(receipt.kind).toBe('UNITARY_CDR_RECEIPT');
    expect(receipt.saleId).toBe('s-h3c');
    expect(receipt.tenantId).toBe('t-h3c');
    expect(receipt.cdrCode).toBe('0');
    expect(receipt.accepted).toBe(true);
    // Referencia D1 en la misma transición SENT.
    expect(db.state.find((r) => r.id === 'h3c')?.status).toBe('SENT');
    expect(db.sentCdrKeys.get('h3c')).toBe(key);
  });

  it('chaos: fallo de R2 al archivar → SENT igual, r2_cdr_key NULL, warn', async () => {
    const db = memoryDb([]);
    const r2 = memoryR2();
    await seedAcceptedRow(db, r2);
    const innerPut = r2.put.bind(r2);
    r2.put = (k, v) =>
      k.startsWith('fiscal-cdr/') ? Promise.reject(new Error('R2_DOWN')) : innerPut(k, v);

    let warned = '';
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warned = args.map(String).join(' ');
    };
    try {
      const result = await drainFiscalOutbox({
        db,
        r2,
        transport: acceptedTransport(),
        isBreakerOpen: () => Promise.resolve(false),
        onInfraFailure: () => Promise.resolve(),
      });
      // El CDR ya es válido ante SUNAT: el ACCEPTED permanece intacto.
      expect(result.accepted).toBe(1);
      expect(db.state.find((r) => r.id === 'h3c')?.status).toBe('SENT');
      expect(db.sentCdrKeys.get('h3c')).toBeNull(); // referencia honesta
      expect(warned).toContain('UNITARY_CDR_ARCHIVE_FAILED');
    } finally {
      console.warn = originalWarn;
    }
  });
});
