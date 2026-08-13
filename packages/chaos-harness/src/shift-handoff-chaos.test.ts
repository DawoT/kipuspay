import { describe, expect, it } from 'vitest';
import {
  judgeShiftHandoffChaos,
  runShiftHandoffChaos,
  runShiftHandoffChaosScenario,
} from './shift-handoff-chaos.js';

describe('ops.shift_handoff chaos (Sprint 51, fail-closed)', () => {
  it('500 ciclos sin evidencia → FAIL; puro sin faults + evidencia real → PASS', async () => {
    const plain = await runShiftHandoffChaosScenario();
    expect(plain).toBe('FAIL');
    // Sin faults (modelo puro sano) + evidencia del engine → PASS.
    const healthy = runShiftHandoffChaos(500, [], true);
    const badSamples = healthy.samples.filter((s) => !s.invariantsHeld).slice(0, 3);
    console.log('BAD', JSON.stringify(badSamples));
    console.log('PIN_USED size', healthy.samples.filter((s) => s.winners === 0).length);
    expect(judgeShiftHandoffChaos(healthy)).toBe('PASS');
  });

  it('fault doubleTransferSamePin → 1 winner máximo (0 doble handoff)', () => {
    const result = runShiftHandoffChaos(5, ['doubleTransferSamePin']);
    expect(result.samples.every((s) => s.winners <= 1)).toBe(true);
  });

  it('fault pinReuseAfterUse → 0 winners, detectado (invariantsHeld=false)', () => {
    const result = runShiftHandoffChaos(3, ['pinReuseAfterUse']);
    expect(result.samples[0]?.winners).toBe(0);
    expect(result.samples[0]?.pinReused).toBe(true);
    expect(result.samples[0]?.invariantsHeld).toBe(false);
    expect(judgeShiftHandoffChaos({ ...result, engineEvidenceVerified: true })).toBe('FAIL');
  });

  it('fault auditFork → FAIL (cadena bifurcada detectable)', () => {
    const result = runShiftHandoffChaos(3, ['auditFork']);
    expect(result.samples[0]?.auditLinear).toBe(false);
    expect(result.samples[0]?.invariantsHeld).toBe(false);
    expect(judgeShiftHandoffChaos({ ...result, engineEvidenceVerified: true })).toBe('FAIL');
  });
});
