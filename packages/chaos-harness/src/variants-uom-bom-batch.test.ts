import { describe, expect, it } from 'vitest';
import {
  judgeVariantsUomBomBatch,
  runVariantsUomBomBatchChaos,
  runVariantsUomBomBatchChaosScenario,
} from './variants-uom-bom-batch.js';

describe('chaos variants-uom-bom-batch', () => {
  it('passes 500 exact cycles without sibling or batch drift', async () => {
    const result = runVariantsUomBomBatchChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(result.cycles).toBe(500);
    await expect(runVariantsUomBomBatchChaosScenario()).resolves.toBe('PASS');
  });

  it('fails short or drifting evidence', () => {
    expect(judgeVariantsUomBomBatch({ cycles: 499, discrepancies: 0, samples: [] })).toBe('FAIL');
    expect(judgeVariantsUomBomBatch({ cycles: 500, discrepancies: 1, samples: [] })).toBe('FAIL');
  });
});
