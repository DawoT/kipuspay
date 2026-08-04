import { describe, expect, it } from 'vitest';
import {
  ChaosScenarioNotReadyError,
  assertScenarioReady,
  runChaosScenario,
  SCENARIO_ACTIVE_FROM,
} from './index.js';

describe('chaos-harness contrato §13.5', () => {
  it('rechaza concurrent-writers antes del Sprint 4', () => {
    expect(() => assertScenarioReady('concurrent-writers', 1)).toThrow(ChaosScenarioNotReadyError);
  });

  it('permite invocar la guarda en Sprint 4 pero el runner aún no existe', async () => {
    expect(SCENARIO_ACTIVE_FROM['concurrent-writers']).toBe(4);
    await expect(runChaosScenario('concurrent-writers', 4)).rejects.toThrow(/sin runner/);
  });
});
