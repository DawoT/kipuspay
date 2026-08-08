import { describe, expect, it } from 'vitest';
import {
  judgeDataBackupChaos,
  runDataBackupChaos,
  type DataBackupChaosResult,
} from './data-backup-chaos.js';

describe('Sprint 42 data backup chaos contract', () => {
  it('500 cycles preserve tenant, integrity, crypto and POS availability', async () => {
    const first = await runDataBackupChaos(500);
    const replay = await runDataBackupChaos(500);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      cycles: 500,
      crossTenantLeaks: 0,
      plaintextKeyLeaks: 0,
      nonceReuses: 0,
      readyBackupsAfterTamper: 0,
      readyBackupsAfterEpochExhaustion: 0,
      orphanMultipartUploads: 0,
      dryRunBusinessWrites: 0,
      restoreApplyAttemptsAccepted: 0,
      posSaleBlocks: 0,
      posSyncBlocks: 0,
      closeZBlocks: 0,
      unclassifiedTenantTables: 0,
      deterministicCiphertexts: 0,
      plaintextReproducibilityFailures: 0,
      opaqueErrorLeaks: 0,
    });
    expect(first.coverage).toEqual({
      epochDrifts: 100,
      r2ObjectTamper: 100,
      kmsUnavailable: 100,
      kekRotations: 100,
      multipartInterruptions: 100,
      multipartConflicts: 100,
      crossTenantAttempts: 100,
      staleStepUpAttempts: 100,
      dryRuns: 100,
      offlinePendingWarnings: 100,
    });
    expect(judgeDataBackupChaos(first)).toBe('PASS');
  });

  it.each([
    ['short run', { cycles: 499 }],
    ['cross tenant', { crossTenantLeaks: 1 }],
    ['plaintext key', { plaintextKeyLeaks: 1 }],
    ['nonce reuse', { nonceReuses: 1 }],
    ['R2 tamper publish', { readyBackupsAfterTamper: 1 }],
    ['epoch exhaustion publish', { readyBackupsAfterEpochExhaustion: 1 }],
    ['multipart orphan', { orphanMultipartUploads: 1 }],
    ['dry-run write', { dryRunBusinessWrites: 1 }],
    ['restore apply', { restoreApplyAttemptsAccepted: 1 }],
    ['sale block', { posSaleBlocks: 1 }],
    ['sync block', { posSyncBlocks: 1 }],
    ['close Z block', { closeZBlocks: 1 }],
    ['registry gap', { unclassifiedTenantTables: 1 }],
    ['deterministic ciphertext', { deterministicCiphertexts: 1 }],
    ['plaintext mismatch', { plaintextReproducibilityFailures: 1 }],
    ['opaque error leak', { opaqueErrorLeaks: 1 }],
  ])('judge rejects %s', (_case, patch) => {
    const valid: DataBackupChaosResult = {
      cycles: 500,
      crossTenantLeaks: 0,
      plaintextKeyLeaks: 0,
      nonceReuses: 0,
      readyBackupsAfterTamper: 0,
      readyBackupsAfterEpochExhaustion: 0,
      orphanMultipartUploads: 0,
      dryRunBusinessWrites: 0,
      restoreApplyAttemptsAccepted: 0,
      posSaleBlocks: 0,
      posSyncBlocks: 0,
      closeZBlocks: 0,
      unclassifiedTenantTables: 0,
      deterministicCiphertexts: 0,
      plaintextReproducibilityFailures: 0,
      opaqueErrorLeaks: 0,
      coverage: {
        epochDrifts: 100,
        r2ObjectTamper: 100,
        kmsUnavailable: 100,
        kekRotations: 100,
        multipartInterruptions: 100,
        multipartConflicts: 100,
        crossTenantAttempts: 100,
        staleStepUpAttempts: 100,
        dryRuns: 100,
        offlinePendingWarnings: 100,
      },
    };
    expect(judgeDataBackupChaos({ ...valid, ...patch })).toBe('FAIL');
  });
});
