import { describe, expect, it } from 'vitest';
import {
  judgeDrFailoverChaos,
  runDrFailoverChaos,
  runDrFailoverChaosScenario,
  type DrFailoverChaosSample,
} from './dr-failover.js';

describe('platform.dr game day (Sprint 48)', () => {
  it('500 ciclos sin fallas → PASS (RPO=0, RPO≤1d, 0 duplicados en replay)', async () => {
    const verdict = await runDrFailoverChaosScenario();
    expect(verdict).toBe('PASS');
  });

  it('fault rpoTxLoss → FAIL (pérdida de tx comprometidas detectable)', () => {
    const result = runDrFailoverChaos(3, ['rpoTxLoss']);
    const first = result.samples[0];
    expect(first?.rpoTxZero).toBe(false);
    expect(first?.invariantsHeld).toBe(false);
    expect(judgeDrFailoverChaos(result)).toBe('FAIL');
  });

  it('fault rpoRollupStale → FAIL (rollup >1d)', () => {
    const result = runDrFailoverChaos(3, ['rpoRollupStale']);
    const first = result.samples[0];
    expect(first?.rpoRollupOneDay).toBe(false);
    expect(judgeDrFailoverChaos(result)).toBe('FAIL');
  });

  it('fault replayDuplicate → FAIL (duplicados no bloqueados)', () => {
    const result = runDrFailoverChaos(3, ['replayDuplicate']);
    const first = result.samples[0];
    expect(first?.duplicatesBlocked).toBeLessThan(3);
    expect(judgeDrFailoverChaos(result)).toBe('FAIL');
  });

  it('deps inyectadas ganan sobre el modelo local', async () => {
    const fake: DrFailoverChaosSample = {
      cycle: 0,
      fault: null,
      salesRestored: 5,
      salesExpected: 5,
      rollupCovered: true,
      duplicatesBlocked: 3,
      rpoTxZero: true,
      rpoRollupOneDay: true,
      invariantsHeld: true,
    };
    const verdict = await runDrFailoverChaosScenario(() =>
      Promise.resolve({ cycles: 1, samples: [fake] }),
    );
    expect(verdict).toBe('PASS');
  });
});
