import { describe, expect, it } from 'vitest';
import {
  judgeUsageOverageIdempotent,
  runUsageOverageIdempotentChaos,
} from './usage-overage-idempotent.js';
import { runChaosScenario } from './index.js';

describe('usage-overage-idempotent chaos Sprint 27', () => {
  it('doble cron → 1 report; venta past cupo OK', async () => {
    expect(await runUsageOverageIdempotentChaos()).toBe('PASS');
    expect(await runChaosScenario('usage-overage-idempotent', 27)).toBe('PASS');
  });

  it('juez falla si doble-cobra o 402', () => {
    expect(
      judgeUsageOverageIdempotent({
        doubleCronReports: 2,
        salePastSoftCapOk: true,
        checkoutReturned402: false,
      }),
    ).toBe('FAIL');
    expect(
      judgeUsageOverageIdempotent({
        doubleCronReports: 1,
        salePastSoftCapOk: true,
        checkoutReturned402: true,
      }),
    ).toBe('FAIL');
  });
});
