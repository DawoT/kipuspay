import { describe, expect, it } from 'vitest';
import {
  judgeInstallmentPayIdempotent,
  runInstallmentPayIdempotentChaos,
} from './installment-pay-idempotent.js';

describe('installment-pay-idempotent chaos', () => {
  it('500 cycles PASS', () => {
    const result = runInstallmentPayIdempotentChaos(500);
    expect(judgeInstallmentPayIdempotent(result)).toBe('PASS');
    expect(result.discrepancies).toBe(0);
  });
});
