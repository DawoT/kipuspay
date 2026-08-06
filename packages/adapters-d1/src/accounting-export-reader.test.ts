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
});
