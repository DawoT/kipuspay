import { describe, expect, it } from 'vitest';
import {
  ChaosScenarioNotReadyError,
  assertScenarioReady,
  judgeConcurrentWriters,
  judgeDeadlineChaos,
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

  it('Sprint 4 concurrent-writers fail-closed sin deps', async () => {
    await expect(runChaosScenario('concurrent-writers', 4)).rejects.toThrow(
      /exige deps\.runConcurrentWriters/,
    );
  });

  it('Sprint 4 duplicate-retry fail-closed sin deps y PASS con inject', async () => {
    await expect(runChaosScenario('duplicate-retry', 4)).rejects.toThrow(
      /exige deps\.runDuplicateRetry/,
    );
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

  it('deadline chaos fail-closed sin deps y PASS con inject', async () => {
    expect(SCENARIO_ACTIVE_FROM.deadline).toBe(5);
    expect(() => assertScenarioReady('deadline', 4)).toThrow(ChaosScenarioNotReadyError);
    await expect(runChaosScenario('deadline', 5)).rejects.toThrow(/exige deps\.runDeadline/);
    await expect(
      runChaosScenario('deadline', 5, {
        runDeadline: () =>
          Promise.resolve({
            steps: [
              { alert: 'T24H', suggestCreditNoteEa: false },
              { alert: 'T6H', suggestCreditNoteEa: false },
              { alert: 'DEADLINE_EXCEEDED', suggestCreditNoteEa: true },
            ],
            finalSunatStatus: 'DEADLINE_EXCEEDED',
            silentExpiry: false,
          }),
      }),
    ).resolves.toBe('PASS');
  });

  it('jueces deadline fallan ante silent expiry / sin E-A / status malo', () => {
    expect(
      judgeDeadlineChaos({
        steps: [],
        finalSunatStatus: 'PENDING',
        silentExpiry: true,
      }),
    ).toBe('FAIL');
    expect(
      judgeDeadlineChaos({
        steps: [{ alert: 'T24H', suggestCreditNoteEa: false }],
        finalSunatStatus: 'DEADLINE_EXCEEDED',
        silentExpiry: false,
      }),
    ).toBe('FAIL');
    expect(
      judgeDeadlineChaos({
        steps: [{ alert: 'DEADLINE_EXCEEDED', suggestCreditNoteEa: false }],
        finalSunatStatus: 'DEADLINE_EXCEEDED',
        silentExpiry: false,
      }),
    ).toBe('FAIL');
    expect(
      judgeDeadlineChaos({
        steps: [{ alert: 'DEADLINE_EXCEEDED', suggestCreditNoteEa: true }],
        finalSunatStatus: 'PENDING',
        silentExpiry: false,
      }),
    ).toBe('FAIL');
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
