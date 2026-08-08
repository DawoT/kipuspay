import { describe, expect, it, vi } from 'vitest';
import {
  isDataBackupEnabled,
  runCreateBackupHttp,
  runDownloadBackupHttp,
  runRestoreDryRunHttp,
} from './backup/backup-routes.js';
import { runBackupWorkflow } from './backup/backup-workflow.js';

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

  it('allows Owner/Admin create but requires recent Owner step-up for download and dry-run', async () => {
    const cashier = { ...owner, role: 'cashier' };
    const admin = { ...owner, userId: 'admin-a', role: 'admin' };
    const staleOwner = { ...owner, stepUpAt: '2026-08-08T18:00:00.000Z' };
    await expect(
      runCreateBackupHttp(env(), cashier, { idempotencyKey: 'cashier' }),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      runCreateBackupHttp(env(), admin, { idempotencyKey: 'admin' }),
    ).resolves.toMatchObject({ status: 202 });
    await expect(
      runDownloadBackupHttp(env(), staleOwner, { backupId: 'backup-a' }),
    ).resolves.toMatchObject({ status: 401, body: { code: 'STEP_UP_REQUIRED' } });
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
      body: { code: 'BACKUP_KMS_UNAVAILABLE', errorRef: expect.any(String) },
    });
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
});
