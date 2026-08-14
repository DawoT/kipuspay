import { describe, expect, it } from 'vitest';
import {
  judgeQuoteConvertExpire,
  runQuoteConvertExpireChaos,
  runQuoteConvertExpireChaosScenario,
} from './quote-convert-expire.js';

describe('chaos quote-convert-expire', () => {
  it('passes 500 cycles without CPE, reserve or snapshot drift', async () => {
    const result = runQuoteConvertExpireChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(result.cycles).toBe(500);
    await expect(runQuoteConvertExpireChaosScenario()).resolves.toBe('FAIL');
  });

  it('fails short or drifting evidence', () => {
    expect(
      judgeQuoteConvertExpire({
        cycles: 499,
        discrepancies: 0,
        samples: [],
        engineEvidenceVerified: true,
      }),
    ).toBe('FAIL');
    expect(
      judgeQuoteConvertExpire({
        cycles: 500,
        discrepancies: 1,
        samples: [],
        engineEvidenceVerified: true,
      }),
    ).toBe('FAIL');
  });

  it('500 ciclos + evidencia real del motor → PASS', () => {
    const result = runQuoteConvertExpireChaos(500, true);
    expect(result.discrepancies).toBe(0);
    expect(judgeQuoteConvertExpire(result)).toBe('PASS');
  });
});
