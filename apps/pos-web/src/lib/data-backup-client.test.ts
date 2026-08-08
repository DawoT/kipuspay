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

  it('matches Worker routes/DTOs and sends step-up only on dry-run', async () => {
    const authenticatedFetch = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = createDataBackupClient({
      authenticatedFetch,
      online: () => true,
      stepUpToken: () => 'recent-reauth-token',
    });
    await client.list();
    await client.status('backup-a');
    await client.create({ idempotencyKey: 'create-1' });
    await client.dryRun('backup-a', { idempotencyKey: 'dry-1' });

    const calls = authenticatedFetch.mock.calls as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/backups', 'GET'],
      ['/api/backups/backup-a', 'GET'],
      ['/api/backups', 'POST'],
      ['/api/backups/backup-a/restore-dry-run', 'POST'],
    ]);
    expect(JSON.parse(calls[2]?.[1].body as string)).toEqual({ idempotencyKey: 'create-1' });
    expect(JSON.parse(calls[3]?.[1].body as string)).toEqual({ idempotencyKey: 'dry-1' });
    expect(new Headers(calls[0]?.[1].headers).has('x-step-up-token')).toBe(false);
    expect(new Headers(calls[2]?.[1].headers).has('x-step-up-token')).toBe(false);
    expect(new Headers(calls[3]?.[1].headers).get('x-step-up-token')).toBe('recent-reauth-token');
  });

  it('fails closed without auth/step-up or while offline and does not persist reauth', async () => {
    const authenticatedFetch = vi.fn<typeof fetch>();
    const offline = createDataBackupClient({
      authenticatedFetch,
      online: () => false,
      stepUpToken: () => null,
    });
    await expect(offline.list()).resolves.toEqual({ items: [], offline: true });
    await expect(offline.create({ idempotencyKey: 'x' })).rejects.toThrow('BACKUP_OFFLINE');
    await expect(offline.download('backup-a')).rejects.toThrow('BACKUP_OFFLINE');
    await expect(offline.dryRun('backup-a', { idempotencyKey: 'x' })).rejects.toThrow(
      'BACKUP_OFFLINE',
    );
    expect(authenticatedFetch).not.toHaveBeenCalled();

    const online = createDataBackupClient({
      authenticatedFetch,
      online: () => true,
      stepUpToken: () => null,
    });
    await expect(online.dryRun('backup-a', { idempotencyKey: 'x' })).rejects.toThrow(
      'STEP_UP_REQUIRED',
    );
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('streams downloads without buffering the full response', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const authenticatedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = createDataBackupClient({
      authenticatedFetch,
      online: () => true,
      stepUpToken: () => null,
    });
    await expect(client.download('backup-a')).resolves.toBeInstanceOf(ReadableStream);
  });
});
