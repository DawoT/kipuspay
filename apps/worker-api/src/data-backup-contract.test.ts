import { describe, expect, it, vi } from 'vitest';
import type * as BackupRestoreValidatorModule from './backup/backup-restore-validator.js';
import {
  isDataBackupEnabled,
  runCreateBackupHttp,
  runDownloadBackupHttp,
  runRestoreDryRunHttp,
} from './backup/backup-routes.js';
import { runBackupWorkflow } from './backup/backup-workflow.js';

const restoreValidator = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    status: 'PASSED',
    insertCount: 0,
    updateCount: 0,
    conflictCount: 0,
    missingObjectCount: 0,
    differences: [],
    truncated: false,
  }),
);
vi.mock('./backup/backup-restore-validator.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BackupRestoreValidatorModule>()),
  validateReadyBackup: restoreValidator,
}));

const owner = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: 'owner',
  stepUpAt: '2026-08-08T20:00:00.000Z',
};

const env = (overrides: Record<string, unknown> = {}) =>
  ({
    FEATURE_DATA_BACKUP: '1',
    BACKUP_KMS: {
      wrap: vi.fn().mockResolvedValue({ wrappedDek: new Uint8Array([1]), kekVersion: 'kek-7' }),
      unwrap: vi.fn().mockResolvedValue(new Uint8Array(32)),
    },
    BACKUPS: {
      createMultipartUpload: vi.fn(),
      resumeMultipartUpload: vi.fn(),
      abortMultipartUpload: vi.fn(),
    },
    ...overrides,
  }) as never;

describe('data.backup Worker flags, RBAC and tenant boundary', () => {
  it('is default-off and does not expose routes', async () => {
    expect(isDataBackupEnabled(env({ FEATURE_DATA_BACKUP: undefined }))).toBe(false);
    await expect(
      runCreateBackupHttp(env({ FEATURE_DATA_BACKUP: undefined }), owner, {
        idempotencyKey: 'idem-1',
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('allows Owner/Admin export/download but requires recent Owner step-up for dry-run', async () => {
    const cashier = { ...owner, role: 'cashier' };
    const admin = { ...owner, userId: 'admin-a', role: 'admin' };
    await expect(
      runCreateBackupHttp(env(), cashier, { idempotencyKey: 'cashier' }),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      runCreateBackupHttp(env(), admin, { idempotencyKey: 'admin' }),
    ).resolves.toMatchObject({ status: 202 });
    await expect(
      runDownloadBackupHttp(env(), admin, { backupId: 'backup-a' }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      runRestoreDryRunHttp(env(), admin, { backupId: 'backup-a', idempotencyKey: 'dry-1' }),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('ignores client tenant authority and returns opaque cross-tenant 404', async () => {
    await expect(
      runCreateBackupHttp(env(), owner, {
        tenantId: 'tenant-b',
        r2Key: 'tenant-b/private',
        kekVersion: 'attacker-key',
        idempotencyKey: 'idem-cross',
      }),
    ).resolves.toMatchObject({ status: 400, body: { code: 'BACKUP_UNTRUSTED_FIELD' } });
    await expect(
      runDownloadBackupHttp(env(), owner, { backupId: 'tenant-b-backup' }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });
});

describe('data.backup Workflow, R2 and KMS contracts', () => {
  it('uses versioned KMS wrapping and fails closed when KMS is unavailable', async () => {
    const unavailable = env({
      BACKUP_KMS: {
        wrap: vi.fn().mockRejectedValue(new Error('provider details must stay opaque')),
      },
    });
    await expect(
      runBackupWorkflow(unavailable, { tenantId: 'tenant-a', backupId: 'backup-a' }),
    ).rejects.toMatchObject({ code: 'BACKUP_KMS_UNAVAILABLE' });
    const status = await runDownloadBackupHttp(unavailable, owner, { backupId: 'backup-a' });
    expect(status).toMatchObject({
      status: 503,
      body: { code: 'BACKUP_KMS_UNAVAILABLE' },
    });
    expect(status.body).not.toBeInstanceOf(ReadableStream);
    if (!(status.body instanceof ReadableStream)) {
      expect(typeof status.body.errorRef).toBe('string');
    }
    expect(JSON.stringify(status)).not.toContain('provider details');
  });

  it('supports KEK rotation without changing existing payload ciphertext', async () => {
    const binding = {
      wrap: vi
        .fn()
        .mockResolvedValueOnce({ wrappedDek: new Uint8Array([1]), kekVersion: 'kek-7' })
        .mockResolvedValueOnce({ wrappedDek: new Uint8Array([2]), kekVersion: 'kek-8' }),
      unwrap: vi.fn().mockResolvedValue(new Uint8Array(32)),
    };
    const first = await runBackupWorkflow(env({ BACKUP_KMS: binding }), {
      tenantId: 'tenant-a',
      backupId: 'backup-a',
    });
    const rotated = await first.rewrap('kek-8');
    expect(rotated.kekVersion).toBe('kek-8');
    expect(rotated.payloadCiphertextHash).toBe(first.payloadCiphertextHash);
    expect(rotated.wrappedDek).not.toEqual(first.wrappedDek);
  });

  it('resumes matching multipart parts and aborts on conflict or terminal failure', async () => {
    const resumeMultipartUpload = vi.fn().mockResolvedValue([
      { part: 1, ciphertextHash: 'same' },
      { part: 2, ciphertextHash: 'conflict' },
    ]);
    const abortMultipartUpload = vi.fn().mockResolvedValue(undefined);
    await expect(
      runBackupWorkflow(env({ BACKUPS: { resumeMultipartUpload, abortMultipartUpload } }), {
        tenantId: 'tenant-a',
        backupId: 'backup-resume',
        checkpoint: {
          parts: [
            { part: 1, ciphertextHash: 'same' },
            { part: 2, ciphertextHash: 'expected' },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_MULTIPART_CONFLICT' });
    expect(abortMultipartUpload).toHaveBeenCalledOnce();
  });

  it('downloads READY backups with no-store headers and bounded streaming', async () => {
    const response = await runDownloadBackupHttp(env(), owner, { backupId: 'backup-ready' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(response.metrics.maxBufferedBytes).toBeLessThanOrEqual(4 * 1024 * 1024 + 16);
  });

  it('schedules restore audit start/result asynchronously in strict order', async () => {
    const batches: { params: unknown[] }[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...params: unknown[]) => ({
          sql,
          params,
          first: vi.fn(() => {
            if (sql.includes('tenant_capabilities')) return Promise.resolve({ enabled: 1 });
            if (sql.includes('SELECT global_hash')) {
              return Promise.resolve({ global_hash: 'a'.repeat(64) });
            }
            return Promise.resolve(null);
          }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue(undefined),
        })),
        first: vi.fn(),
        all: vi.fn(),
      })),
      batch: vi.fn((statements: { params: unknown[] }[]) => {
        batches.push(statements);
        return Promise.resolve([]);
      }),
    };
    const scheduled: Promise<void>[] = [];
    const response = await runRestoreDryRunHttp(
      env({ DB: db }),
      owner,
      { backupId: 'backup-ready', idempotencyKey: 'restore-async-1' },
      (task) => scheduled.push(task),
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'PASSED', missingObjectCount: 0 });
    expect(restoreValidator).toHaveBeenCalledWith(expect.objectContaining({ DB: db }), {
      tenantId: 'tenant-a',
      backupId: 'backup-ready',
    });
    expect(scheduled).toHaveLength(1);
    await Promise.all(scheduled);
    expect(batches.map((batch) => batch[1]?.params[3])).toEqual([
      'RESTORE_DRY_RUN_STARTED',
      'RESTORE_DRY_RUN_PASSED',
    ]);
  });

  it('returns an allowlisted failure and audits only after validation rejects', async () => {
    restoreValidator.mockRejectedValueOnce(new Error('BACKUP_CHUNK_TAMPERED'));
    const actions: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...params: unknown[]) => ({
          first: vi.fn(() => {
            if (sql.includes('tenant_capabilities')) return Promise.resolve({ enabled: 1 });
            if (sql.includes('SELECT global_hash')) {
              return Promise.resolve({ global_hash: 'a'.repeat(64) });
            }
            if (sql.includes('SELECT row_hash')) return Promise.resolve(null);
            return Promise.resolve(null);
          }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue(undefined),
          sql,
          params,
        })),
      })),
      batch: vi.fn((statements: { params: unknown[] }[]) => {
        actions.push(String(statements[1]?.params[3]));
        return Promise.resolve([]);
      }),
    };
    const scheduled: Promise<void>[] = [];
    const response = await runRestoreDryRunHttp(
      env({ DB: db }),
      owner,
      { backupId: 'backup-ready', idempotencyKey: 'restore-failed-1' },
      (task) => scheduled.push(task),
    );
    expect(response).toMatchObject({
      status: 422,
      body: { code: 'BACKUP_CHUNK_TAMPERED' },
    });
    expect(actions).toEqual([]);
    await Promise.all(scheduled);
    expect(actions).toEqual(['RESTORE_DRY_RUN_STARTED', 'RESTORE_DRY_RUN_FAILED']);
  });
});
