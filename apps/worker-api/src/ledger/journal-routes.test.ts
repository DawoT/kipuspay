import { describe, expect, it } from 'vitest';
import { runListJournalHttp, runMutateJournalHttp } from './journal-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function env(): WorkerEnv {
  return {
    FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1',
    DB: {
      prepare() {
        const stmt = {
          bind() {
            return stmt;
          },
          first: () => Promise.resolve(null),
          all: () =>
            Promise.resolve({
              results: [{ id: 'j1', account_code: '1011' }],
              success: true,
              meta: {},
            }),
          run: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
}

describe('journal routes', () => {
  it('GET lists entries when flag on', async () => {
    const res = await runListJournalHttp(env(), 't1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      branchId: 'b1',
    });
    expect(res.status).toBe(200);
    expect((res.body.items as unknown[]).length).toBe(1);
  });

  it('POST/PATCH journal is forbidden', () => {
    expect(runMutateJournalHttp().status).toBe(403);
    expect(runMutateJournalHttp().body.code).toBe('JOURNAL_READ_ONLY');
  });

  it('404 when flag off', async () => {
    const res = await runListJournalHttp(
      { FEATURE_LEDGER_CHART_OF_ACCOUNTS: '0' } as unknown as WorkerEnv,
      't1',
      {
        fromDate: '2026-08-01',
        toDate: '2026-08-07',
        branchId: 'b1',
      },
    );
    expect(res.status).toBe(404);
  });

  it('503 without DB and 400 without range', async () => {
    const noDb = await runListJournalHttp(
      { FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1' } as unknown as WorkerEnv,
      't1',
      { fromDate: '2026-08-01', toDate: '2026-08-07', branchId: 'b1' },
    );
    expect(noDb.status).toBe(503);
    const bad = await runListJournalHttp(env(), 't1', { fromDate: '', toDate: '', branchId: '' });
    expect(bad.status).toBe(400);
  });
});
