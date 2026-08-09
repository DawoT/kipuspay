import { describe, expect, it } from 'vitest';
import {
  RECURRING_SALES_FAULTS,
  judgeRecurringSalesChaos,
  runRecurringSalesChaos,
  type RecurringSalesChaosResult,
} from './recurring-sales.js';

describe('Sprint 44 recurring-sales chaos 500 contract (RED)', () => {
  it('covers 500 deterministic scheduler, drift, retry, cancellation, payment and CDR races', async () => {
    const first = await runRecurringSalesChaos(500);
    const replay = await runRecurringSalesChaos(500);
    expect(replay).toEqual(first);
    expect(first.cycles).toBe(500);
    expect(first.samples).toHaveLength(500);
    expect(Object.keys(first.coverage)).toEqual(RECURRING_SALES_FAULTS);
    expect(first).toMatchObject({
      duplicateOccurrences: 0,
      duplicateSales: 0,
      duplicateFiscalDocuments: 0,
      duplicateAccountsReceivable: 0,
      duplicateUsageEvents: 0,
      skippedPeriods: 0,
      partialCommits: 0,
      partialStockMutations: 0,
      staleFixedPrices: 0,
      staleCurrentPrices: 0,
      unauthorizedMoneyInputs: 0,
      originalSaleMutations: 0,
      duplicateProrationReturns: 0,
      checkoutBlocks: 0,
      fiscalCheckoutBlocks: 0,
      auditForks: 0,
    });
    expect(first.samples.filter((sample) => !sample.invariantsHeld)).toEqual([]);
    expect(judgeRecurringSalesChaos(first)).toBe('PASS');
  });

  it('derives all failure counters from samples and rejects incomplete evidence', async () => {
    const result = await runRecurringSalesChaos(500);
    const failureKeys = [
      'duplicateOccurrences',
      'duplicateSales',
      'duplicateFiscalDocuments',
      'duplicateAccountsReceivable',
      'duplicateUsageEvents',
      'skippedPeriods',
      'partialCommits',
      'partialStockMutations',
      'staleFixedPrices',
      'staleCurrentPrices',
      'unauthorizedMoneyInputs',
      'originalSaleMutations',
      'duplicateProrationReturns',
      'checkoutBlocks',
      'fiscalCheckoutBlocks',
      'auditForks',
    ] as const satisfies readonly (keyof RecurringSalesChaosResult)[];
    for (const key of failureKeys) {
      expect(result[key]).toBe(
        result.samples.filter((sample) => sample.failures.includes(key)).length,
      );
    }
    expect(judgeRecurringSalesChaos({ ...result, samples: result.samples.slice(1) })).toBe('FAIL');
  });

  it('includes every required adversarial fault family', () => {
    expect(RECURRING_SALES_FAULTS).toEqual(
      expect.arrayContaining([
        'duplicateCron',
        'shardTimeout',
        'priceDrift',
        'stockDrift',
        'retryOutOfOrder',
        'cancelVsRun',
        'pauseVsRun',
        'latePayment',
        'delayedCdr',
        'statementFailure',
        'catchUpCap',
      ]),
    );
  });
});
