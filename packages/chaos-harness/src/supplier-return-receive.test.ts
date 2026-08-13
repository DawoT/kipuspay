import { describe, expect, it } from 'vitest';
import {
  judgeSupplierReturnReceive,
  runSupplierReturnReceiveChaos,
  runSupplierReturnReceiveChaosScenario,
} from './supplier-return-receive.js';

describe('chaos supplier-return-receive', () => {
  it('passes 500 cycles without CPE, silent AP or stock on OPEN', async () => {
    const result = runSupplierReturnReceiveChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(result.cycles).toBe(500);
    await expect(runSupplierReturnReceiveChaosScenario()).resolves.toBe('FAIL');
  });

  it('fails short or drifting evidence', () => {
    expect(judgeSupplierReturnReceive({ cycles: 499, discrepancies: 0, samples: [], engineEvidenceVerified: true })).toBe('FAIL');
    expect(judgeSupplierReturnReceive({ cycles: 500, discrepancies: 1, samples: [], engineEvidenceVerified: true })).toBe('FAIL');
  });

  it('500 ciclos + evidencia real del motor → PASS', () => {
    const result = runSupplierReturnReceiveChaos(500, true);
    expect(result.discrepancies).toBe(0);
    expect(judgeSupplierReturnReceive(result)).toBe('PASS');
  });
});
