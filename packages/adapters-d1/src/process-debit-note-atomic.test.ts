import { describe, expect, it } from 'vitest';
import { processDebitNoteAtomic } from './process-debit-note-atomic.js';

interface World {
  origin?: Record<string, unknown> | null;
  series?: { id: string; series: string; current_number: number } | null;
  ar?: { id: string; balance_due_cents: number } | null;
  guardFails?: boolean;
}

const ORIGIN = {
  id: 's1',
  document_type: '01',
  sunat_status: 'ACCEPTED',
  total_amount_cents: 118000,
  branch_id: 'b1',
  cash_register_session_id: 'sess-1',
  client_document_type: '6',
  client_document_number: '20123456789',
  client_name: 'Empresa SAC',
};

function mockDb(world: World = {}): never {
  const first = (sql: string) => {
    if (sql.includes('FROM sales')) return world.origin ?? null;
    if (sql.includes('FROM branch_document_series')) return world.series ?? null;
    if (sql.includes('FROM accounts_receivable')) return world.ar ?? null;
    if (sql.includes('row_hash')) return null;
    return null;
  };
  const prepare = (sql: string) => ({
    sql,
    bind() {
      return {
        sql,
        first: () => Promise.resolve(first(sql)),
      };
    },
  });
  return {
    prepare,
    batch: (stmts: readonly { sql?: string }[]) => {
      const guard = stmts.find((s) => (s.sql ?? '').includes('INSERT INTO atomic_guards'));
      if (guard && world.guardFails) {
        throw new Error('CHECK constraint failed: atomic_guards');
      }
      return Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } })));
    },
  } as never;
}

function worldWith(overrides: Partial<World> = {}): World {
  return {
    origin: ORIGIN,
    series: { id: 'ser-8', series: 'FC01', current_number: 41 },
    ...overrides,
  };
}

describe('processDebitNoteAtomic (P1a, ADR-FISCAL-003)', () => {
  it('emite ND sobre factura aceptada con correlativo +1 y must_submit_by factura', async () => {
    const res = await processDebitNoteAtomic(
      mockDb(worldWith()),
      't1',
      'u1',
      's1',
      {
        motiveCode: '02',
        amountCents: 5900,
        description: 'Aumento de valor',
      },
      'FC01',
    );
    expect(res.documentType).toBe('08');
    expect(res.series).toBe('FC01');
    expect(res.number).toBe(42);
    expect(res.motiveCode).toBe('02');
    expect(res.mustSubmitByIso.length).toBeGreaterThan(0);
  });

  it('ORIGIN_NOT_FOUND si el origen no existe', async () => {
    await expect(
      processDebitNoteAtomic(
        mockDb(worldWith({ origin: null })),
        't1',
        'u1',
        's-x',
        {
          motiveCode: '02',
          amountCents: 100,
        },
        'FC01',
      ),
    ).rejects.toThrow('ORIGIN_NOT_FOUND');
  });

  it('rechaza origen no ACCEPTED (FISCAL_CDR_REQUIRED)', async () => {
    await expect(
      processDebitNoteAtomic(
        mockDb(worldWith({ origin: { ...ORIGIN, sunat_status: 'PENDING' } })),
        't1',
        'u1',
        's1',
        { motiveCode: '02', amountCents: 100 },
        'FC01',
      ),
    ).rejects.toThrow('FISCAL_CDR_REQUIRED');
  });

  it('rechaza motivo fuera del catálogo 10', async () => {
    await expect(
      processDebitNoteAtomic(
        mockDb(worldWith()),
        't1',
        'u1',
        's1',
        {
          motiveCode: '99',
          amountCents: 100,
        },
        'FC01',
      ),
    ).rejects.toThrow('INVALID_DEBIT_NOTE_MOTIVE');
  });

  it('SERIES_NOT_FOUND si no hay serie 08 activa', async () => {
    await expect(
      processDebitNoteAtomic(
        mockDb(worldWith({ series: null })),
        't1',
        'u1',
        's1',
        {
          motiveCode: '02',
          amountCents: 100,
        },
        'FC01',
      ),
    ).rejects.toThrow('SERIES_NOT_FOUND');
  });

  it('acumula el saldo AR del origen cuando ledger está activo', async () => {
    const res = await processDebitNoteAtomic(
      mockDb(worldWith({ ar: { id: 'ar-1', balance_due_cents: 0 } })),
      't1',
      'u1',
      's1',
      { motiveCode: '02', amountCents: 5900 },
      'FC01',
      { ledgerArApEnabled: true },
    );
    expect(res.amountCents).toBe(5900);
  });

  it('el guard aborta la emisión concurrente (doble uso de la serie)', async () => {
    await expect(
      processDebitNoteAtomic(
        mockDb(worldWith({ guardFails: true })),
        't1',
        'u1',
        's1',
        {
          motiveCode: '02',
          amountCents: 100,
        },
        'FC01',
      ),
    ).rejects.toThrow('CHECK constraint failed');
  });

  it('S10-C6: la ND consume 1 comprobante de cupo (usage_events + usage_counters)', async () => {
    let captured: readonly { sql?: string }[] = [];
    const db = mockDb(worldWith());
    (db as { batch: unknown }).batch = (stmts: readonly { sql?: string }[]) => {
      captured = stmts;
      return Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } })));
    };
    const res = await processDebitNoteAtomic(
      db,
      't1',
      'u1',
      's1',
      {
        motiveCode: '02',
        amountCents: 5900,
      },
      'FC01',
    );
    expect(res.amountCents).toBe(5900);
    const sqls = captured.map((s) => s.sql ?? '');
    expect(sqls.some((s) => s.includes('INSERT INTO usage_events'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO usage_counters'))).toBe(true);
  });
});
