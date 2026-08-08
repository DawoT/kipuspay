import { describe, expect, it } from 'vitest';
import {
  GL,
  JOURNAL_INVALID_LINE,
  JOURNAL_UNBALANCED,
  SEED_CHART_OF_ACCOUNTS,
  assertJournalBalanced,
  journalLinesToSignedAmounts,
  planApPaymentJournal,
  planArPaymentJournal,
  planCashCountJournal,
  planLayawayDepositJournal,
  planLayawayRefundJournal,
  planSaleJournal,
  planSalesReturnJournal,
  planStoreCreditAdjustJournal,
  planStoreCreditExpireJournal,
  planSupplierInvoiceJournal,
  planSupplierReturnJournal,
} from './journal.js';

describe('journal posting', () => {
  it('seeds S23 GL plus deposits and AP', () => {
    const codes = SEED_CHART_OF_ACCOUNTS.map((row) => row.code).sort();
    expect(codes).toEqual(['1011', '1212', '2011', '2101', '2102', '4011', '6011', '6591', '7011']);
    expect(SEED_CHART_OF_ACCOUNTS.find((row) => row.code === GL.CASH)?.type).toBe('ASSET');
  });

  it('matches S23 cash sale asiento', () => {
    const plan = planSaleJournal({
      sourceId: 's1',
      postDate: '2026-08-07',
      totalCents: 11_800,
      taxCents: 1_800,
      payments: [{ methodCode: 'cash', amountCents: 11_800 }],
    });
    expect(plan.balancedCents).toBe(0);
    expect(plan.lines.map((line) => `${line.code}:${line.debitCents}:${line.creditCents}`)).toEqual(
      ['1011:11800:0', '7011:0:10000', '4011:0:1800'],
    );
  });

  it('matches S23 mixed C4 split 1011/1212', () => {
    const plan = planSaleJournal({
      sourceId: 's2',
      postDate: '2026-08-07',
      totalCents: 10_000,
      taxCents: 1_525,
      payments: [
        { methodCode: 'yape', amountCents: 6_000 },
        { methodCode: 'credit', amountCents: 4_000 },
      ],
    });
    expect(plan.lines.find((line) => line.code === '1011')?.debitCents).toBe(6_000);
    expect(plan.lines.find((line) => line.code === '1212')?.debitCents).toBe(4_000);
    expect(plan.balancedCents).toBe(0);
  });

  it('posts layaway deposit as 1011 vs 2101', () => {
    const plan = planLayawayDepositJournal({
      sourceId: 'd1',
      postDate: '2026-08-07',
      amountCents: 500,
    });
    expect(plan.lines).toEqual([
      { code: '1011', debitCents: 500, creditCents: 0, memo: 'layaway:d1:deposit:cash' },
      { code: '2101', debitCents: 0, creditCents: 500, memo: 'layaway:d1:deposit:liability' },
    ]);
    expect(plan.balancedCents).toBe(0);
  });

  it('rejects unbalanced journals', () => {
    expect(() =>
      assertJournalBalanced([
        { code: '1011', debitCents: 100, creditCents: 0, memo: 'x' },
        { code: '7011', debitCents: 0, creditCents: 90, memo: 'y' },
      ]),
    ).toThrow(JOURNAL_UNBALANCED);
  });

  it('maps anticipo payments to 2101 on sale journal', () => {
    const plan = planSaleJournal({
      sourceId: 's4',
      postDate: '2026-08-07',
      totalCents: 11_800,
      taxCents: 1_800,
      payments: [{ methodCode: 'anticipo', amountCents: 11_800 }],
    });
    expect(plan.lines.find((line) => line.code === '2101')?.debitCents).toBe(11_800);
    expect(plan.lines.find((line) => line.code === '1011')).toBeUndefined();
  });

  it('defaults sale journal to cash when payments are empty', () => {
    const plan = planSaleJournal({
      sourceId: 's5',
      postDate: '2026-08-07',
      totalCents: 118,
      taxCents: 18,
      payments: [],
    });
    expect(plan.lines.find((line) => line.code === '1011')?.debitCents).toBe(118);
  });

  it('rejects invalid refund/AR/AP/invoice lines and posts Z/return', () => {
    expect(() =>
      planLayawayRefundJournal({ sourceId: 'd1', postDate: '2026-08-07', amountCents: 0 }),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(
      planLayawayRefundJournal({ sourceId: 'd1', postDate: '2026-08-07', amountCents: 200 })
        .balancedCents,
    ).toBe(0);
    expect(
      planArPaymentJournal({ sourceId: 'ar1', postDate: '2026-08-07', amountCents: 100 })
        .balancedCents,
    ).toBe(0);
    expect(
      planApPaymentJournal({ sourceId: 'ap1', postDate: '2026-08-07', amountCents: 100 })
        .balancedCents,
    ).toBe(0);
    expect(
      planSupplierInvoiceJournal({ sourceId: 'inv1', postDate: '2026-08-07', amountCents: 500 })
        .balancedCents,
    ).toBe(0);
    expect(
      planCashCountJournal({ sourceId: 'z0', postDate: '2026-08-07', differenceCents: 0 }),
    ).toBeNull();
    expect(
      planCashCountJournal({ sourceId: 'z1', postDate: '2026-08-07', differenceCents: 50 })
        ?.balancedCents,
    ).toBe(0);
    expect(
      planCashCountJournal({ sourceId: 'z2', postDate: '2026-08-07', differenceCents: -50 })
        ?.balancedCents,
    ).toBe(0);
    const ret = planSalesReturnJournal({
      sourceId: 'r1',
      postDate: '2026-08-07',
      totalCents: 11_800,
      taxCents: 1_800,
      payments: [{ methodCode: 'cash', amountCents: 11_800 }],
    });
    expect(ret.sourceType).toBe('SALES_RETURN');
    expect(ret.balancedCents).toBe(0);
    expect(journalLinesToSignedAmounts(ret.lines)[0]?.amountCents).toBe(-11_800);
    expect(() =>
      assertJournalBalanced([{ code: '1011', debitCents: 10, creditCents: 5, memo: 'xor' }]),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(() =>
      assertJournalBalanced([{ code: '1011', debitCents: -1, creditCents: 0, memo: 'neg' }]),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(() => assertJournalBalanced([])).toThrow(JOURNAL_UNBALANCED);
    expect(() =>
      assertJournalBalanced([{ code: '1011', debitCents: 1.5, creditCents: 0, memo: 'float' }]),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(() =>
      planLayawayDepositJournal({ sourceId: 'd0', postDate: '2026-08-07', amountCents: 0 }),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(() =>
      planArPaymentJournal({ sourceId: 'ar0', postDate: '2026-08-07', amountCents: 0 }),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(() =>
      planApPaymentJournal({ sourceId: 'ap0', postDate: '2026-08-07', amountCents: 0 }),
    ).toThrow(JOURNAL_INVALID_LINE);
    expect(() =>
      planSupplierInvoiceJournal({ sourceId: 'inv0', postDate: '2026-08-07', amountCents: 0 }),
    ).toThrow(JOURNAL_INVALID_LINE);
    const sr = planSupplierReturnJournal({
      sourceId: 'sr1',
      postDate: '2026-08-08',
      amountCents: 500,
    });
    expect(sr.sourceType).toBe('SUPPLIER_RETURN');
    expect(sr.balancedCents).toBe(0);
    expect(sr.lines.map((line) => `${line.code}:${line.debitCents}:${line.creditCents}`)).toEqual([
      '2011:500:0',
      '6011:0:500',
    ]);
    expect(() =>
      planSupplierReturnJournal({ sourceId: 'sr0', postDate: '2026-08-08', amountCents: 0 }),
    ).toThrow(JOURNAL_INVALID_LINE);
    const vale = planSaleJournal({
      sourceId: 'vale1',
      postDate: '2026-08-08',
      totalCents: 11_800,
      taxCents: 1_800,
      payments: [{ methodCode: 'cash', amountCents: 11_800 }],
      storeCreditIssueCents: 11_800,
    });
    expect(vale.lines.find((line) => line.code === '2102')?.creditCents).toBe(10_000);
    expect(vale.lines.find((line) => line.code === '7011')).toBeUndefined();
    const redeem = planSaleJournal({
      sourceId: 's-sc',
      postDate: '2026-08-08',
      totalCents: 11_800,
      taxCents: 1_800,
      payments: [{ methodCode: 'store_credit', amountCents: 11_800 }],
    });
    expect(redeem.lines.find((line) => line.code === '2102')?.debitCents).toBe(11_800);
    expect(redeem.lines.find((line) => line.code === '1011')).toBeUndefined();
    expect(redeem.lines.find((line) => line.code === '2101')).toBeUndefined();
    const exp = planStoreCreditExpireJournal({
      sourceId: 'tx1',
      postDate: '2026-08-08',
      amountCents: 500,
    });
    expect(exp.sourceType).toBe('STORE_CREDIT');
    expect(exp.balancedCents).toBe(0);
    expect(
      planStoreCreditAdjustJournal({
        sourceId: 'tx2',
        postDate: '2026-08-08',
        amountCents: 100,
        adjustSign: 'CREDIT',
      }).balancedCents,
    ).toBe(0);
    expect(
      planStoreCreditAdjustJournal({
        sourceId: 'tx3',
        postDate: '2026-08-08',
        amountCents: 100,
        adjustSign: 'DEBIT',
      }).balancedCents,
    ).toBe(0);
  });
});
