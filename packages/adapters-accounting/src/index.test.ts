import { describe, expect, it } from 'vitest';
import {
  formatAccountingExport,
  formatAmountFromCents,
  formatContasisCsv,
  formatConcarXml,
  netBalanceCents,
} from './index.js';
import type { AccountingEntry } from '@kipuspay/domain-integrations';

const sample: AccountingEntry[] = [
  {
    sourceSaleId: 's1',
    branchId: 'b1',
    bookedAt: '2026-08-01',
    glAccount: '1011',
    amountCents: 11800,
    line: 1,
    memo: 'sale:s1:debit',
  },
  {
    sourceSaleId: 's1',
    branchId: 'b1',
    bookedAt: '2026-08-01',
    glAccount: '7011',
    amountCents: -10000,
    line: 2,
    memo: 'sale:s1:sales',
  },
  {
    sourceSaleId: 's1',
    branchId: 'b1',
    bookedAt: '2026-08-01',
    glAccount: '4011',
    amountCents: -1800,
    line: 3,
    memo: 'sale:s1:vat',
  },
];

describe('netBalanceCents', () => {
  it('suma movimientos contables', () => {
    expect(
      netBalanceCents([
        { glAccount: '1212', amountCents: 10000 },
        { glAccount: '4011', amountCents: -1530 },
      ]),
    ).toBe(8470);
  });
});

describe('formatAmountFromCents', () => {
  it('decimal string sin float', () => {
    expect(formatAmountFromCents(8470)).toBe('84.70');
  });
});

describe('Contasis/Concar writers', () => {
  it('Contasis CSV bit-reproducible', () => {
    const a = formatContasisCsv(sample);
    const b = formatContasisCsv([...sample].reverse());
    expect(a).toBe(b);
    expect(a).toContain('fecha,cuenta,debe,haber,glosa,documento,sucursal');
    expect(a).toContain('118.00');
    expect(a).toContain('100.00');
  });

  it('Concar XML bit-reproducible', () => {
    const a = formatConcarXml(sample);
    const b = formatConcarXml([...sample].reverse());
    expect(a).toBe(b);
    expect(a).toContain('<Asientos');
    expect(a).toContain('KipusPay');
    expect(a).toContain('debe="118.00"');
  });

  it('formatAccountingExport dispatch', () => {
    expect(formatAccountingExport('contasis', sample).filename).toBe('contasis-asientos.csv');
    expect(formatAccountingExport('concar', sample).contentType).toContain('xml');
  });

  it('escape CSV y XML', () => {
    const dirty: AccountingEntry[] = [
      {
        ...sample[0]!,
        memo: 'a,b"c',
        sourceSaleId: 's<1>',
      },
    ];
    expect(formatContasisCsv(dirty)).toContain('"a,b""c"');
    expect(formatConcarXml(dirty)).toContain('documento="s&lt;1&gt;"');
  });
});
