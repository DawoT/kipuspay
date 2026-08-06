import { describe, expect, it } from 'vitest';
import {
  buildAccountingEntries,
  centsToDecimalString,
  isAccountingExportTarget,
  sortAccountingEntries,
  type AccountingSaleRow,
} from './accounting-export.js';

describe('accounting-export', () => {
  it('acepta targets contasis|concar', () => {
    expect(isAccountingExportTarget('contasis')).toBe(true);
    expect(isAccountingExportTarget('concar')).toBe(true);
    expect(isAccountingExportTarget('siigo')).toBe(false);
  });

  it('formatea cents como decimal string sin float', () => {
    expect(centsToDecimalString(8470)).toBe('84.70');
    expect(centsToDecimalString(100)).toBe('1.00');
    expect(centsToDecimalString(-1530)).toBe('-15.30');
    expect(centsToDecimalString(0)).toBe('0.00');
  });

  it('deriva asientos estables desde ventas/CxC (read-only contract)', () => {
    const rows: AccountingSaleRow[] = [
      {
        saleId: 's2',
        branchId: 'b1',
        soldAt: '2026-08-02T10:00:00.000Z',
        totalCents: 11800,
        taxCents: 1800,
        payments: [{ methodCode: 'cash', amountCents: 11800 }],
        arBalanceCents: 0,
      },
      {
        saleId: 's1',
        branchId: 'b1',
        soldAt: '2026-08-01T10:00:00.000Z',
        totalCents: 11800,
        taxCents: 1800,
        payments: [{ methodCode: 'credit', amountCents: 11800 }],
        arBalanceCents: 11800,
      },
    ];
    const entries = buildAccountingEntries(rows);
    expect(entries.map((e) => e.sourceSaleId)).toEqual(['s1', 's1', 's1', 's2', 's2', 's2']);
    expect(entries.every((e) => Number.isInteger(e.amountCents))).toBe(true);
    const again = buildAccountingEntries(rows);
    expect(JSON.stringify(sortAccountingEntries(again))).toBe(
      JSON.stringify(sortAccountingEntries(entries)),
    );
  });

  it('sort estable por fecha, saleId, line, glAccount', () => {
    const sorted = sortAccountingEntries([
      {
        sourceSaleId: 's1',
        branchId: 'b1',
        bookedAt: '2026-08-01',
        glAccount: '7011',
        amountCents: -10000,
        line: 2,
        memo: 'x',
      },
      {
        sourceSaleId: 's1',
        branchId: 'b1',
        bookedAt: '2026-08-01',
        glAccount: '1212',
        amountCents: 11800,
        line: 1,
        memo: 'y',
      },
      {
        sourceSaleId: 's1',
        branchId: 'b1',
        bookedAt: '2026-08-01',
        glAccount: '4011',
        amountCents: -1800,
        line: 2,
        memo: 'z',
      },
      {
        sourceSaleId: 's2',
        branchId: 'b1',
        bookedAt: '2026-08-02',
        glAccount: '1011',
        amountCents: 100,
        line: 1,
        memo: 'w',
      },
    ]);
    expect(sorted.map((e) => `${e.sourceSaleId}:${e.line}:${e.glAccount}`)).toEqual([
      's1:1:1212',
      's1:2:4011',
      's1:2:7011',
      's2:1:1011',
    ]);
    const tied = sortAccountingEntries([
      {
        sourceSaleId: 's1',
        branchId: 'b1',
        bookedAt: '2026-08-01',
        glAccount: '1011',
        amountCents: 1,
        line: 1,
        memo: 'a',
      },
      {
        sourceSaleId: 's1',
        branchId: 'b1',
        bookedAt: '2026-08-01',
        glAccount: '1011',
        amountCents: 2,
        line: 1,
        memo: 'b',
      },
    ]);
    expect(tied).toHaveLength(2);
  });

  it('C4: pago mixto efectivo+crédito reparte el débito 1011/1212', () => {
    const rows: AccountingSaleRow[] = [
      {
        saleId: 's3',
        branchId: 'b1',
        soldAt: '2026-08-03T10:00:00.000Z',
        totalCents: 10000,
        taxCents: 1526,
        payments: [
          { methodCode: 'cash', amountCents: 6000 },
          { methodCode: 'credit', amountCents: 4000 },
        ],
        arBalanceCents: 4000,
      },
    ];
    const entries = buildAccountingEntries(rows);
    const debits = entries.filter((e) => e.amountCents > 0);
    expect(debits.map((d) => `${d.glAccount}:${d.amountCents}`).sort()).toEqual([
      '1011:6000',
      '1212:4000',
    ]);
  });

  it('C4: dos métodos cash-like suman en caja 1011', () => {
    const rows: AccountingSaleRow[] = [
      {
        saleId: 's4',
        branchId: 'b1',
        soldAt: '2026-08-04T10:00:00.000Z',
        totalCents: 9000,
        taxCents: 1373,
        payments: [
          { methodCode: 'cash', amountCents: 5000 },
          { methodCode: 'yape', amountCents: 4000 },
        ],
        arBalanceCents: 0,
      },
    ];
    const entries = buildAccountingEntries(rows);
    const debits = entries.filter((e) => e.amountCents > 0);
    expect(debits.map((d) => `${d.glAccount}:${d.amountCents}`).sort()).toEqual(['1011:9000']);
  });
});
