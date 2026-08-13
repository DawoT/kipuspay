/* eslint-disable no-secrets/no-secrets -- certification environment label is not a secret */
import { describe, expect, it } from 'vitest';
import {
  DATA_BACKUP_FAULTS,
  judgeDataBackupChaos,
  runDataBackupChaos,
  type DataBackupChaosResult,
} from './data-backup-chaos.js';

const ZERO_FAILURES = {
  mixedSnapshots: 0,
  plaintextLeaksR2: 0,
  keyLeaksD1: 0,
  sensitiveLogLeaks: 0,
  nonceReuses: 0,
  duplicateFinalChunks: 0,
  auditForks: 0,
  readyBeforeCompleteManifest: 0,
  dryRunD1Mutations: 0,
  lostPartialCleanups: 0,
  checkoutBlocks: 0,
  nonIdempotentBackupWinners: 0,
  undetectedTamper: 0,
} as const;

describe('Sprint 42 data-backup certification chaos', () => {
  it('runs a deterministic balanced 500-cycle local certification matrix', async () => {
    const first = await runDataBackupChaos(500);
    const replay = await runDataBackupChaos(500);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      cycles: 500,
      ...ZERO_FAILURES,
      evidence: {
        environment: 'LOCAL_FAKE_BINDINGS_WORKERD',
        realCloudflareStaging: false,
        externalR2: false,
        externalKms: false,
      },
    });
    expect(Object.keys(first.coverage)).toEqual(DATA_BACKUP_FAULTS);
    expect(Object.values(first.coverage)).toEqual(DATA_BACKUP_FAULTS.map(() => 20));
    expect(first.samples).toHaveLength(500);
    expect(first.samples.every((sample) => sample.invariantsHeld)).toBe(true);
    expect(judgeDataBackupChaos(first)).toBe('FAIL');
    expect(judgeDataBackupChaos({ ...first, engineEvidenceVerified: true })).toBe('PASS');
  });

  it.each(Object.keys(ZERO_FAILURES) as (keyof typeof ZERO_FAILURES)[])(
    'fails closed when %s is non-zero',
    (failure) => {
      const valid = validResult();
      expect(judgeDataBackupChaos({ ...valid, [failure]: 1 })).toBe('FAIL');
    },
  );

  it('rejects short, unbalanced, or falsely external evidence', () => {
    const valid = validResult();
    expect(judgeDataBackupChaos({ ...valid, cycles: 499 })).toBe('FAIL');
    expect(
      judgeDataBackupChaos({
        ...valid,
        coverage: { ...valid.coverage, r2Timeout: 19 },
      }),
    ).toBe('FAIL');
    expect(
      judgeDataBackupChaos({
        ...valid,
        evidence: { ...valid.evidence, realCloudflareStaging: true },
      } as unknown as DataBackupChaosResult),
    ).toBe('FAIL');
  });

  it('rejects invalid cycle counts', async () => {
    await expect(runDataBackupChaos(-1)).rejects.toThrow('CHAOS_CYCLES_INVALID');
    await expect(runDataBackupChaos(1.5)).rejects.toThrow('CHAOS_CYCLES_INVALID');
  });
});

function validResult(): DataBackupChaosResult {
  return {
    cycles: 500,
    ...ZERO_FAILURES,
    coverage: Object.fromEntries(
      DATA_BACKUP_FAULTS.map((fault) => [fault, 20]),
    ) as DataBackupChaosResult['coverage'],
    evidence: {
      environment: 'LOCAL_FAKE_BINDINGS_WORKERD',
      realCloudflareStaging: false,
      externalR2: false,
      externalKms: false,
    },
    samples: [],
    engineEvidenceVerified: true,
  };
}
