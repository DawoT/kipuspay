import { describe, expect, it } from 'vitest';
import {
  judgeStoreCreditIssueRedeem,
  runStoreCreditIssueRedeemChaos,
} from './store-credit-issue-redeem.js';

describe('store-credit-issue-redeem', () => {
  it('500 ciclos 0 drift', () => {
    const result = runStoreCreditIssueRedeemChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(judgeStoreCreditIssueRedeem(result)).toBe('PASS');
  });
});
