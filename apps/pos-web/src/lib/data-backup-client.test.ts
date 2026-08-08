import { describe, expect, it, vi } from 'vitest';
import {
  backupClaimState,
  backupOfflineWarning,
  createDataBackupClient,
  isDataBackupEnabled,
} from './data-backup-client.js';

describe('data.backup POS seams', () => {
  it('defaults the public capability and claims off', () => {
    vi.stubEnv('PUBLIC_FEATURE_DATA_BACKUP', '');
    expect(isDataBackupEnabled()).toBe(false);
    expect(backupClaimState({ sprint42Gate: 'RED', sprint48Gate: 'RED' })).toEqual({
      exportHistory: 'LOCKED',
      restoreDryRun: 'LOCKED',
      restoreApply: 'LOCKED',
      drRto: 'LOCKED',
    });
    vi.unstubAllEnvs();
  });

  it('warns that unsynced IndexedDB is excluded and offers sync without blocking POS', () => {
    expect(backupOfflineWarning({ pendingIndexedDbMutations: 3, online: false })).toEqual({
      visible: true,
      severity: 'warning',
      code: 'BACKUP_EXCLUDES_UNSYNCED_CHANGES',
      pendingCount: 3,
      canSyncNow: false,
      saleBlocked: false,
      checkoutBlocked: false,
      closeZBlocked: false,
    });
  });

  it('keeps sale, sync and close-Z available during backup retry/abort', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('BACKUP_EPOCH_DRIFT'));
    const sale = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    const sync = vi.fn().mockResolvedValue({ status: 'SYNCED' });
    const closeZ = vi.fn().mockResolvedValue({ status: 'CLOSED' });
    const client = createDataBackupClient({ fetcher, sale, sync, closeZ });

    await expect(client.create({ idempotencyKey: 'backup-1' })).rejects.toThrow(
      'BACKUP_EPOCH_DRIFT',
    );
    await expect(client.sale({ id: 'sale-1' })).resolves.toEqual({ status: 'ACCEPTED' });
    await expect(client.sync()).resolves.toEqual({ status: 'SYNCED' });
    await expect(client.closeZ()).resolves.toEqual({ status: 'CLOSED' });
  });

  it('never exposes restore apply in Sprint 42 UI', () => {
    const state = backupClaimState({ sprint42Gate: 'GREEN', sprint48Gate: 'RED' });
    expect(state).toEqual({
      exportHistory: 'AVAILABLE_SCOPED',
      restoreDryRun: 'AVAILABLE',
      restoreApply: 'LOCKED',
      drRto: 'LOCKED',
    });
  });
});
