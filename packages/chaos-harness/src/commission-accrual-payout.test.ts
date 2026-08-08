import { describe, expect, it } from 'vitest';
import {
  judgeCommissionAccrualPayout,
  runCommissionAccrualPayoutChaos,
  runCommissionAccrualPayoutChaosScenario,
} from './commission-accrual-payout.js';

describe('commission-accrual-payout chaos', () => {
  it('500 ciclos 0 drift', async () => {
    const result = runCommissionAccrualPayoutChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(judgeCommissionAccrualPayout(result)).toBe('PASS');
    await expect(runCommissionAccrualPayoutChaosScenario()).resolves.toBe('PASS');
  });
});
