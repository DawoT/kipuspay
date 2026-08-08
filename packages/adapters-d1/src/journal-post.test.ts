import { describe, expect, it } from 'vitest';
import { planSaleJournal } from '@kipuspay/domain-cash';
import { appendJournalToPlan, loadChartAccountsByCode } from './journal-post.js';
import type { D1Bound, D1DatabaseLike } from './index.js';

function mockDb(accountRows: readonly { id: string; code: string }[]): D1DatabaseLike {
  const seeded: { id: string; code: string }[] = [...accountRows];
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: () => Promise.resolve(null),
        all: () =>
          Promise.resolve({
            results: sql.includes('FROM chart_of_accounts') ? seeded : [],
            success: true,
            meta: {},
          }),
        run: () => {
          if (sql.includes('INSERT INTO chart_of_accounts')) {
            seeded.push({ id: `coa-${seeded.length}`, code: `x${seeded.length}` });
          }
          return Promise.resolve({ results: [], success: true, meta: {} });
        },
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) =>
      Promise.resolve(stmts.map(() => ({ results: [], success: true, meta: {} }))),
  } as D1DatabaseLike;
}

describe('journal-post', () => {
  it('seeds chart when tenant has fewer than seed accounts', async () => {
    const db = mockDb([{ id: 'coa-1011', code: '1011' }]);
    const map = await loadChartAccountsByCode(db, 't1');
    expect(map.size).toBeGreaterThan(1);
  });

  it('reuses existing chart when already seeded', async () => {
    const db = mockDb([
      { id: 'coa-1011', code: '1011' },
      { id: 'coa-1212', code: '1212' },
      { id: 'coa-2011', code: '2011' },
      { id: 'coa-2101', code: '2101' },
      { id: 'coa-2102', code: '2102' },
      { id: 'coa-4011', code: '4011' },
      { id: 'coa-6011', code: '6011' },
      { id: 'coa-6591', code: '6591' },
      { id: 'coa-7011', code: '7011' },
    ]);
    const map = await loadChartAccountsByCode(db, 't1');
    expect(map.get('2101')).toBe('coa-2101');
    expect(map.get('2102')).toBe('coa-2102');
    expect(map.size).toBe(9);
  });

  it('appends journal entry + lines + JOURNAL_POST audit', async () => {
    const added: unknown[] = [];
    const db = mockDb([
      { id: 'coa-1011', code: '1011' },
      { id: 'coa-7011', code: '7011' },
      { id: 'coa-4011', code: '4011' },
    ]);
    const result = await appendJournalToPlan({ add: (stmt) => added.push(stmt) }, db, {
      tenantId: 't1',
      branchId: 'b1',
      userId: 'u1',
      prevAuditHash: null,
      accountsByCode: new Map([
        ['1011', 'coa-1011'],
        ['7011', 'coa-7011'],
        ['4011', 'coa-4011'],
      ]),
      entry: planSaleJournal({
        sourceId: 's1',
        postDate: '2026-08-07',
        totalCents: 11800,
        taxCents: 1800,
        payments: [{ methodCode: 'cash', amountCents: 11800 }],
      }),
    });
    expect(result.journalEntryId).toBeTruthy();
    expect(added.length).toBe(5);
  });

  it('rejects missing GL account', async () => {
    const db = mockDb([]);
    await expect(
      appendJournalToPlan({ add: () => undefined }, db, {
        tenantId: 't1',
        branchId: 'b1',
        userId: 'u1',
        prevAuditHash: null,
        accountsByCode: new Map(),
        entry: planSaleJournal({
          sourceId: 's1',
          postDate: '2026-08-07',
          totalCents: 118,
          taxCents: 18,
          payments: [{ methodCode: 'cash', amountCents: 118 }],
        }),
      }),
    ).rejects.toThrow(/JOURNAL_ACCOUNT_MISSING/);
  });
});
