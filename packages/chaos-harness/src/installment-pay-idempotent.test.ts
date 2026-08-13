import { describe, expect, it } from 'vitest';
import {
  judgeInstallmentPayIdempotent,
  runInstallmentPayIdempotentChaos,
} from './installment-pay-idempotent.js';

describe('installment-pay-idempotent chaos', () => {
  it('500 cycles PASS', () => {
    const result = runInstallmentPayIdempotentChaos(500);
    expect(judgeInstallmentPayIdempotent(result)).toBe('FAIL');
    expect(result.discrepancies).toBe(0);
  });

  it('500 ciclos + evidencia real del motor → PASS', () => {
    const result = runInstallmentPayIdempotentChaos(500, true);
    expect(result.discrepancies).toBe(0);
    expect(judgeInstallmentPayIdempotent(result)).toBe('PASS');
  });
});
