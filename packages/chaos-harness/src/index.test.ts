import { describe, expect, it } from 'vitest';
import {
  ChaosScenarioNotReadyError,
  assertScenarioReady,
  judgeConcurrentWriters,
  judgeDuplicateRetry,
  runChaosScenario,
  SCENARIO_ACTIVE_FROM,
} from './index.js';

describe('chaos-harness contrato §13.5', () => {
  it('rechaza concurrent-writers antes del Sprint 4', () => {
    expect(() => assertScenarioReady('concurrent-writers', 1)).toThrow(ChaosScenarioNotReadyError);
  });

  it('Sprint 4 concurrent-writers PASS con deps coherentes', async () => {
    expect(SCENARIO_ACTIVE_FROM['concurrent-writers']).toBe(4);
    await expect(
      runChaosScenario('concurrent-writers', 4, {
        concurrentInitialStock: 2,
        concurrentQtyEach: 1,
        runConcurrentWriters: () =>
          Promise.resolve({
            attempts: [
              { ok: true, offlineSaleId: 'a' },
              { ok: true, offlineSaleId: 'b' },
              { ok: false, offlineSaleId: 'c' },
            ],
            finalStock: 0,
            saleCount: 2,
          }),
      }),
    ).resolves.toBe('PASS');
  });

  it('Sprint 4 concurrent-writers PASS con defaults', async () => {
    await expect(runChaosScenario('concurrent-writers', 4)).resolves.toBe('PASS');
  });

  it('Sprint 4 duplicate-retry PASS con defaults y custom', async () => {
    await expect(runChaosScenario('duplicate-retry', 4)).resolves.toBe('PASS');
    await expect(
      runChaosScenario('duplicate-retry', 4, {
        runDuplicateRetry: () =>
          Promise.resolve({
            firstStatus: 'SUCCESS',
            secondStatus: 'ALREADY_SYNCED',
            saleCount: 1,
          }),
      }),
    ).resolves.toBe('PASS');
  });

  it('rechaza escenario activo en Sprint N sin runner aún', async () => {
    await expect(runChaosScenario('network-adversarial', 6)).rejects.toThrow(/sin runner aún/);
  });

  it('jueces fallan ante incoherencia', () => {
    // saleCount mismatch
    expect(
      judgeConcurrentWriters(5, 1, {
        attempts: [{ ok: true, offlineSaleId: 'a' }],
        finalStock: 4,
        saleCount: 2,
      }),
    ).toBe('FAIL');

    // finalStock mismatch
    expect(
      judgeConcurrentWriters(5, 1, {
        attempts: [{ ok: true, offlineSaleId: 'a' }],
        finalStock: 3,
        saleCount: 1,
      }),
    ).toBe('FAIL');

    // negative finalStock
    expect(
      judgeConcurrentWriters(1, 1, {
        attempts: [{ ok: true, offlineSaleId: 'a' }],
        finalStock: -1,
        saleCount: 1,
      }),
    ).toBe('FAIL');

    // excessive successes
    expect(
      judgeConcurrentWriters(1, 1, {
        attempts: [
          { ok: true, offlineSaleId: 'a' },
          { ok: true, offlineSaleId: 'b' },
        ],
        finalStock: 0,
        saleCount: 2,
      }),
    ).toBe('FAIL');

    // duplicate-retry failures
    expect(
      judgeDuplicateRetry({
        firstStatus: 'FAILED',
        secondStatus: 'ALREADY_SYNCED',
        saleCount: 1,
      }),
    ).toBe('FAIL');

    expect(
      judgeDuplicateRetry({
        firstStatus: 'SUCCESS',
        secondStatus: 'FAILED',
        saleCount: 1,
      }),
    ).toBe('FAIL');

    expect(
      judgeDuplicateRetry({
        firstStatus: 'SUCCESS',
        secondStatus: 'ALREADY_SYNCED',
        saleCount: 2,
      }),
    ).toBe('FAIL');
  });

  it('ChaosScenarioNotReadyError maneja activeFrom null', () => {
    const err = new ChaosScenarioNotReadyError('network-adversarial', null);
    expect(err.message).toContain('no tiene sprint de activación');
  });
});
