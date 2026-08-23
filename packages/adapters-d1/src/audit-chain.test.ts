import { describe, expect, it } from 'vitest';
import {
  appendAuditEvent,
  AUDIT_CHAIN_CONTENTION,
  AUDIT_CHAIN_PREV_MISMATCH,
  auditChainClaimStatements,
  readAuditChainHead,
  type AuditEventRowValues,
} from './audit-chain.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

interface RecordedCall {
  readonly sql: string;
  readonly params: unknown[];
}

interface ScriptedDb {
  readonly db: D1DatabaseLike;
  readonly calls: RecordedCall[];
  readonly batches: readonly RecordedCall[][];
  readonly heads: Map<string, string>;
  failNext: number;
}

function scriptedDb(options?: { readonly heads?: ReadonlyMap<string, string> }): ScriptedDb {
  const heads = new Map(options?.heads ?? []);
  const calls: RecordedCall[] = [];
  const batches: RecordedCall[][] = [];
  let failNextBatches = 0;
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const call: RecordedCall & D1Bound = {
            sql,
            params,
            bind: (...next: unknown[]) => call.bind(...next),
            all: <T>() => Promise.resolve({ results: [] as T[], success: true, meta: {} }),
            first: <T>() =>
              Promise.resolve(
                (sql.includes('FROM audit_chain_heads')
                  ? (() => {
                      const head = heads.get(String(params[0]));
                      return head === undefined ? null : { last_hash: head };
                    })()
                  : null) as T | null,
              ),
            run: () =>
              Promise.resolve({ results: [], success: true, meta: {} } as D1Result<unknown>),
          };
          calls.push(call);
          return call;
        },
      };
    },
    async batch(statements: readonly D1Bound[]) {
      const recorded = statements.map((statement) => statement as unknown as RecordedCall);
      batches.push(recorded);
      if (failNextBatches > 0) {
        failNextBatches -= 1;
        throw new Error('CHECK constraint failed: ok');
      }
      // Simula el efecto del claim sobre las cabezas.
      for (const call of recorded) {
        if (call.sql.startsWith('UPDATE audit_chain_heads')) {
          heads.set(String(call.params[1]), String(call.params[0]));
        }
        if (call.sql.includes('VALUES (?, ?) ON CONFLICT')) {
          if (!heads.has(String(call.params[0]))) {
            heads.set(String(call.params[0]), String(call.params[1]));
          }
        }
      }
      return recorded.map(() => ({ results: [], success: true, meta: {} }));
    },
  };
  return {
    db,
    calls,
    batches,
    heads,
    get failNext(): number {
      return failNextBatches;
    },
    set failNext(value: number) {
      failNextBatches = value;
    },
  };
}

function buildRow(prevHash: string | null, tag: string): AuditEventRowValues {
  return {
    id: `id-${tag}`,
    branchId: null,
    actorUserId: 'u1',
    action: 'TEST',
    entityType: 'x',
    entityId: 'e1',
    payloadJson: '{}',
    prevHash,
    rowHash: `hash-${tag}`,
  };
}

describe('readAuditChainHead', () => {
  it('null sin cabeza (génesis)', async () => {
    const script = scriptedDb();
    expect(await readAuditChainHead(script.db, 't1')).toBeNull();
  });

  it('devuelve la cabeza registrada', async () => {
    const script = scriptedDb({ heads: new Map([['t1', 'hash-0']]) });
    expect(await readAuditChainHead(script.db, 't1')).toBe('hash-0');
  });
});

describe('auditChainClaimStatements', () => {
  it('sin filas de auditoría no hay claim', () => {
    const script = scriptedDb();
    expect(auditChainClaimStatements(script.db, 't1', null, [])).toEqual([]);
  });

  it('génesis: INSERT ON CONFLICT DO NOTHING + guard + cleanup', () => {
    const script = scriptedDb();
    const stmts = auditChainClaimStatements(script.db, 't1', null, ['h1']);
    expect(stmts.length).toBe(3);
    expect((stmts[0] as unknown as RecordedCall).sql).toContain(
      'ON CONFLICT (tenant_id) DO NOTHING',
    );
    expect((stmts[1] as unknown as RecordedCall).sql).toContain('atomic_guards');
  });

  it('avance: CAS UPDATE por last_hash previo + guard', () => {
    const script = scriptedDb();
    const stmts = auditChainClaimStatements(script.db, 't1', 'prev-h', ['h2']);
    expect(stmts.length).toBe(3);
    const first = stmts[0] as unknown as RecordedCall;
    expect(first.sql).toContain('WHERE tenant_id = ? AND last_hash = ?');
    expect(first.params).toEqual(['h2', 't1', 'prev-h']);
  });

  it('cadena multi-fila: la cabeza avanza a la PUNTA', () => {
    const script = scriptedDb();
    const first = auditChainClaimStatements(script.db, 't1', 'p', [
      'a',
      'b',
      'c',
    ])[0] as unknown as RecordedCall;
    expect(first.params[0]).toBe('c');
  });
});

describe('appendAuditEvent', () => {
  it('feliz: INSERT+claim en un solo batch y prev entregado a buildRow', async () => {
    const script = scriptedDb({ heads: new Map([['t1', 'h0']]) });
    const seen: (string | null)[] = [];
    await appendAuditEvent(script.db, { tenantId: 't1' }, (prev) => {
      seen.push(prev);
      return buildRow(prev, '1');
    });
    expect(seen).toEqual(['h0']);
    expect(script.batches.length).toBe(1);
    expect(script.batches[0]?.length).toBe(4);
    expect(script.batches[0]?.[0]?.sql).toContain('INSERT INTO audit_events');
    expect(script.heads.get('t1')).toBe('hash-1');
  });

  it('contención: reintenta y converge en el intento 2', async () => {
    const script = scriptedDb();
    script.failNext = 1;
    await appendAuditEvent(script.db, { tenantId: 't1' }, (prev) => buildRow(prev, 'r'));
    expect(script.batches.length).toBe(2);
    expect(script.heads.get('t1')).toBe('hash-r');
  });

  it('agotamiento: 3 intentos fallidos → AUDIT_CHAIN_CONTENTION codificado', async () => {
    const script = scriptedDb();
    script.failNext = 99;
    await expect(
      appendAuditEvent(script.db, { tenantId: 't1' }, (prev) => buildRow(prev, 'x')),
    ).rejects.toMatchObject({ code: AUDIT_CHAIN_CONTENTION });
    expect(script.batches.length).toBe(3);
  });

  it('fail-closed: buildRow con prev distinto al leído → PREV_MISMATCH, sin batch', async () => {
    const script = scriptedDb();
    await expect(
      appendAuditEvent(script.db, { tenantId: 't1' }, () => Promise.resolve(buildRow('otro', 'm'))),
    ).rejects.toMatchObject({ code: AUDIT_CHAIN_PREV_MISMATCH });
    expect(script.batches.length).toBe(0);
  });

  it('createdAt explícito viaja en el INSERT (11 params)', async () => {
    const script = scriptedDb();
    await appendAuditEvent(script.db, { tenantId: 't1' }, (prev) => ({
      ...buildRow(prev, 'ts'),
      createdAt: '2026-08-22T00:00:00Z',
    }));
    expect(script.batches[0]?.[0]?.params.length).toBe(11);
  });
});
