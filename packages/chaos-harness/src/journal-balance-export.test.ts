import { describe, expect, it } from 'vitest';
import {
  judgeJournalBalanceExport,
  runJournalBalanceExportChaos,
  runJournalBalanceExportChaosScenario,
} from './journal-balance-export.js';

describe('chaos journal-balance-export', () => {
  it('passes 500 balanced cycles matching S23 export', async () => {
    const result = runJournalBalanceExportChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(result.cycles).toBe(500);
    await expect(runJournalBalanceExportChaosScenario()).resolves.toBe('PASS');
  });

  it('fails short or drifting evidence', () => {
    expect(judgeJournalBalanceExport({ cycles: 499, discrepancies: 0, samples: [] })).toBe('FAIL');
    expect(judgeJournalBalanceExport({ cycles: 500, discrepancies: 1, samples: [] })).toBe('FAIL');
  });
});
