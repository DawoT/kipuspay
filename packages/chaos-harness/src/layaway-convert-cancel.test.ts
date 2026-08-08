import { describe, expect, it } from 'vitest';
import {
  judgeLayawayConvertCancel,
  runLayawayConvertCancelChaos,
  runLayawayConvertCancelChaosScenario,
} from './layaway-convert-cancel.js';

describe('chaos layaway-convert-cancel', () => {
  it('passes 500 cycles without CPE or stock drift', async () => {
    const result = runLayawayConvertCancelChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(result.cycles).toBe(500);
    await expect(runLayawayConvertCancelChaosScenario()).resolves.toBe('PASS');
  });

  it('fails short or drifting evidence', () => {
    expect(judgeLayawayConvertCancel({ cycles: 499, discrepancies: 0, samples: [] })).toBe('FAIL');
    expect(judgeLayawayConvertCancel({ cycles: 500, discrepancies: 1, samples: [] })).toBe('FAIL');
  });
});
