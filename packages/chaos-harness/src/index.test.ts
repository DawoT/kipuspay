import { describe, expect, it } from 'vitest';
import {
  ChaosScenarioNotReadyError,
  assertScenarioReady,
  judgeConcurrentWriters,
  judgeDeadlineChaos,
  judgeDuplicateRetry,
  judgeNetworkAdversarial,
  judgeQuotaExceeded,
  judgeLowEndDevice,
  judgeArCompensate,
  runArCompensateCycles,
  runChaosScenario,
  SCENARIO_ACTIVE_FROM,
} from './index.js';
import type { DeadlineChaosResult } from './deadline-chaos.js';

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
    const r1: DeadlineChaosResult = {
      steps: [],
      finalSunatStatus: 'PENDING',
      silentExpiry: true,
    };
    expect(judgeDeadlineChaos(r1)).toBe('FAIL');

    const r2: DeadlineChaosResult = {
      steps: [{ alert: 'T24H', suggestCreditNoteEa: false }],
      finalSunatStatus: 'DEADLINE_EXCEEDED',
      silentExpiry: false,
    };
    expect(judgeDeadlineChaos(r2)).toBe('FAIL');

    const r3: DeadlineChaosResult = {
      steps: [{ alert: 'DEADLINE_EXCEEDED', suggestCreditNoteEa: false }],
      finalSunatStatus: 'DEADLINE_EXCEEDED',
      silentExpiry: false,
    };
    expect(judgeDeadlineChaos(r3)).toBe('FAIL');

    const r4: DeadlineChaosResult = {
      steps: [{ alert: 'DEADLINE_EXCEEDED', suggestCreditNoteEa: true }],
      finalSunatStatus: 'PENDING',
      silentExpiry: false,
    };
    expect(judgeDeadlineChaos(r4)).toBe('FAIL');
  });

  it('network-adversarial y quota-exceeded fail-closed + PASS con inject', async () => {
    expect(SCENARIO_ACTIVE_FROM['network-adversarial']).toBe(6);
    expect(SCENARIO_ACTIVE_FROM['quota-exceeded']).toBe(6);
    await expect(runChaosScenario('network-adversarial', 6)).rejects.toThrow(
      /exige deps\.runNetworkAdversarial/,
    );
    await expect(runChaosScenario('quota-exceeded', 6)).rejects.toThrow(
      /exige deps\.runQuotaExceeded/,
    );
    await expect(
      runChaosScenario('network-adversarial', 6, {
        networkCycles: 3,
        runNetworkAdversarial: (cycles) =>
          Promise.resolve({
            cycles,
            totalEnqueued: cycles,
            totalSucceeded: cycles,
            totalLost: 0,
            totalDuplicates: 0,
          }),
      }),
    ).resolves.toBe('PASS');
    await expect(
      runChaosScenario('quota-exceeded', 6, {
        runQuotaExceeded: () =>
          Promise.resolve({
            alertFiredAtOrAbove80: true,
            blockedAt100: true,
            queueCorrupted: false,
            enqueueRejectedSafely: true,
          }),
      }),
    ).resolves.toBe('PASS');
    expect(
      judgeNetworkAdversarial({
        cycles: 1,
        totalEnqueued: 1,
        totalSucceeded: 0,
        totalLost: 1,
        totalDuplicates: 0,
      }),
    ).toBe('FAIL');
    expect(
      judgeQuotaExceeded({
        alertFiredAtOrAbove80: false,
        blockedAt100: true,
        queueCorrupted: false,
        enqueueRejectedSafely: true,
      }),
    ).toBe('FAIL');
  });

  it('network-adversarial 500 ciclos: 0 pérdida / 0 dup (ack idempotente simulado)', () => {
    const seen = new Set<string>();
    let duplicates = 0;
    let lost = 0;
    let succeeded = 0;
    const cycles = 500;
    for (let i = 0; i < cycles; i++) {
      const id = `sale-${i}`;
      // Adversarial: first post fails; retry succeeds; third post is ALREADY_SYNCED.
      const attempts = ['FAIL', 'SUCCESS', 'ALREADY_SYNCED'] as const;
      let ack: (typeof attempts)[number] | null = null;
      for (const a of attempts) {
        if (a === 'FAIL') continue;
        if (a === 'SUCCESS') {
          if (seen.has(id)) {
            duplicates++;
          } else {
            seen.add(id);
            succeeded++;
          }
          ack = a;
          break;
        }
        if (a === 'ALREADY_SYNCED') {
          if (!seen.has(id)) lost++;
          ack = a;
        }
      }
      if (ack === null) lost++;
    }
    expect(
      judgeNetworkAdversarial({
        cycles,
        totalEnqueued: cycles,
        totalSucceeded: succeeded,
        totalLost: lost,
        totalDuplicates: duplicates,
      }),
    ).toBe('PASS');
    expect(succeeded).toBe(500);
    expect(lost).toBe(0);
    expect(duplicates).toBe(0);
  });

  it('low-end-device fail-closed + PASS con inject', async () => {
    expect(SCENARIO_ACTIVE_FROM['low-end-device']).toBe(7);
    await expect(runChaosScenario('low-end-device', 7)).rejects.toThrow(
      /exige deps\.runLowEndDevice/,
    );
    await expect(
      runChaosScenario('low-end-device', 7, {
        runLowEndDevice: () =>
          Promise.resolve({
            enqueueAttempts: 50,
            survivingPending: 50,
            lost: 0,
            feedbackP95Ms: 12,
          }),
      }),
    ).resolves.toBe('PASS');
    expect(
      judgeLowEndDevice({
        enqueueAttempts: 10,
        survivingPending: 9,
        lost: 1,
        feedbackP95Ms: 5,
      }),
    ).toBe('FAIL');
  });

  it('ar-compensate fail-closed + 500 ciclos 0 drift', async () => {
    expect(SCENARIO_ACTIVE_FROM['ar-compensate']).toBe(8);
    expect(() => assertScenarioReady('ar-compensate', 7)).toThrow(ChaosScenarioNotReadyError);
    await expect(runChaosScenario('ar-compensate', 8)).rejects.toThrow(
      /exige deps\.runArCompensate/,
    );
    const cycles = runArCompensateCycles(500);
    expect(cycles.discrepancies).toBe(0);
    expect(judgeArCompensate(cycles)).toBe('PASS');
    await expect(
      runChaosScenario('ar-compensate', 8, {
        runArCompensate: () => Promise.resolve(cycles),
      }),
    ).resolves.toBe('PASS');
    expect(judgeArCompensate({ cycles: 10, discrepancies: 0, samples: [] })).toBe('FAIL');
    expect(judgeArCompensate({ cycles: 500, discrepancies: 1, samples: [] })).toBe('FAIL');
  });

  it('rechaza escenario activo en Sprint N sin runner aún', async () => {
    await expect(runChaosScenario('shard-do-failure', 26)).rejects.toThrow(/sin runner aún/);
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
