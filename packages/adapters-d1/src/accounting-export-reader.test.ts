import { describe, expect, it } from 'vitest';
import { exportAccountingEntries, readAccountingSaleRows } from './accounting-export-reader.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDbWithQueries(
  saleRows: readonly Record<string, unknown>[],
  paymentRows: readonly Record<string, unknown>[],
): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const rows = sql.includes('sale_payments') ? paymentRows : saleRows;
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => Promise.resolve(null as T | null),
        all: <T>() => Promise.resolve(okResult(rows as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

describe('accounting-export-reader', () => {
  it('mapea filas D1 a AccountingSaleRow y asientos', async () => {
    const db = mockDbWithQueries(
      [
        {
          sale_id: 's1',
          branch_id: 'b1',
          sold_at: '2026-08-01 10:00:00',
          total_cents: 11800,
          tax_cents: 1800,
          ar_balance_cents: null,
        },
      ],
      [{ sale_id: 's1', method_code: 'cash', amount_cents: 11800 }],
    );
    const rows = await readAccountingSaleRows(db, 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
      branchId: 'b1',
    });
    expect(rows[0]?.saleId).toBe('s1');
    expect(rows[0]?.arBalanceCents).toBe(0);
    expect(rows[0]?.payments).toEqual([{ methodCode: 'cash', amountCents: 11800 }]);
    const entries = await exportAccountingEntries(db, 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
      branchId: 'b1',
    });
    expect(entries.length).toBe(3);
    expect(JSON.stringify(entries)).toBe(
      JSON.stringify(
        await exportAccountingEntries(db, 't1', {
          fromDate: '2026-08-01',
          toDate: '2026-08-01',
          branchId: 'b1',
        }),
      ),
    );
  });

  it('C4: desglosa pagos por método y reparte débito 1011/1212', async () => {
    const db = mockDbWithQueries(
      [
        {
          sale_id: 's3',
          branch_id: 'b1',
          sold_at: '2026-08-03 10:00:00',
          total_cents: 10000,
          tax_cents: 1526,
          ar_balance_cents: 4000,
        },
      ],
      [
        { sale_id: 's3', method_code: 'cash', amount_cents: 6000 },
        { sale_id: 's3', method_code: 'credit', amount_cents: 4000 },
      ],
    );
    const rows = await readAccountingSaleRows(db, 't1', {
      fromDate: '2026-08-03',
      toDate: '2026-08-03',
      branchId: 'b1',
    });
    expect(rows[0]?.payments).toEqual([
      { methodCode: 'cash', amountCents: 6000 },
      { methodCode: 'credit', amountCents: 4000 },
    ]);
    const entries = await exportAccountingEntries(db, 't1', {
      fromDate: '2026-08-03',
      toDate: '2026-08-03',
      branchId: 'b1',
    });
    const debits = entries.filter((e) => e.amountCents > 0);
    expect(debits.map((d) => `${d.glAccount}:${d.amountCents}`).sort()).toEqual([
      '1011:6000',
      '1212:4000',
    ]);
  });

  it('flag on: lee journal_lines y no usa ar_balance para 1212', async () => {
    const db = mockDbWithQueries(
      [
        {
          source_sale_id: 's3',
          branch_id: 'b1',
          booked_at: '2026-08-03',
          gl_account: '1011',
          debit_cents: 6000,
          credit_cents: 0,
          memo: 'sale:s3:debit:cash',
        },
        {
          source_sale_id: 's3',
          branch_id: 'b1',
          booked_at: '2026-08-03',
          gl_account: '1212',
          debit_cents: 4000,
          credit_cents: 0,
          memo: 'sale:s3:debit:ar',
        },
        {
          source_sale_id: 's3',
          branch_id: 'b1',
          booked_at: '2026-08-03',
          gl_account: '7011',
          debit_cents: 0,
          credit_cents: 8474,
          memo: 'sale:s3:sales',
        },
        {
          source_sale_id: 's3',
          branch_id: 'b1',
          booked_at: '2026-08-03',
          gl_account: '4011',
          debit_cents: 0,
          credit_cents: 1526,
          memo: 'sale:s3:vat',
        },
      ],
      [],
    );
    const entries = await exportAccountingEntries(
      db,
      't1',
      { fromDate: '2026-08-03', toDate: '2026-08-03', branchId: 'b1' },
      { fromJournal: true },
    );
    expect(entries.map((e) => `${e.glAccount}:${e.amountCents}`)).toEqual([
      '1011:6000',
      '1212:4000',
      '7011:-8474',
      '4011:-1526',
    ]);
  });

  it('flag on: ordena líneas con rank canónico deposit→cash→ar→sales→vat aunque el SQL las devuelva revueltas', async () => {
    const db = mockDbWithQueries(
      [
        {
          source_sale_id: 's4',
          branch_id: 'b1',
          booked_at: '2026-08-04',
          gl_account: '4011',
          debit_cents: 0,
          credit_cents: 1526,
          memo: 'sale:s4:vat',
        },
        {
          source_sale_id: 's4',
          branch_id: 'b1',
          booked_at: '2026-08-04',
          gl_account: '7011',
          debit_cents: 0,
          credit_cents: 8474,
          memo: 'sale:s4:sales',
        },
        {
          source_sale_id: 's4',
          branch_id: 'b1',
          booked_at: '2026-08-04',
          gl_account: '1212',
          debit_cents: 4000,
          credit_cents: 0,
          memo: 'sale:s4:debit:ar',
        },
        {
          source_sale_id: 's4',
          branch_id: 'b1',
          booked_at: '2026-08-04',
          gl_account: '1011',
          debit_cents: 3000,
          credit_cents: 0,
          memo: 'sale:s4:debit:cash',
        },
        {
          source_sale_id: 's4',
          branch_id: 'b1',
          booked_at: '2026-08-04',
          gl_account: '2101',
          debit_cents: 4800,
          credit_cents: 0,
          memo: 'sale:s4:debit:deposit',
        },
      ],
      [],
    );
    const entries = await exportAccountingEntries(
      db,
      't1',
      { fromDate: '2026-08-04', toDate: '2026-08-04', branchId: 'b1' },
      { fromJournal: true },
    );
    expect(entries.map((e) => `${e.glAccount}:${e.amountCents}`)).toEqual([
      '2101:4800',
      '1011:3000',
      '1212:4000',
      '7011:-8474',
      '4011:-1526',
    ]);
    expect(entries.map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
  });
});
