/* eslint-disable no-secrets/no-secrets -- protocol fixtures and allowlisted error codes */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as BackupRestoreValidatorModule from './backup/backup-restore-validator.js';
import {
  isDataBackupEnabled,
  runBackupStatusHttp,
  runCreateBackupHttp,
  runDownloadBackupHttp,
  runListBackupsHttp,
  runMintBackupStepUpTokenHttp,
  runRestoreDryRunHttp,
} from './backup/backup-routes.js';
import { runBackupWorkflow } from './backup/backup-workflow.js';
import { safeBackupErrorCode } from './backup/backup-errors.js';
import { encryptKpbk1Unit } from '@kipuspay/domain-integrations';

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
  permissions: ['data.backup.download', 'data.backup.restore_dry_run'],
  stepUpAt: '2026-08-08T20:00:00.000Z',
};

const token = 'stepup_download_opaque';

async function tokenHash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function downloadDb(input: {
  readonly backupTenant?: string;
  readonly plaintextHash?: string;
  readonly sealed?: Uint8Array;
  readonly nonce?: ArrayBuffer;
  readonly authTag?: ArrayBuffer;
}) {
  const consumed: unknown[][] = [];
  const consumedSql: string[] = [];
  const backupTenant = input.backupTenant ?? 'tenant-a';
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        first: vi.fn(() => {
          if (sql.includes('tenant_capabilities')) return Promise.resolve({ enabled: 1 });
          if (sql.includes('FROM data_backups')) {
            if (params[0] !== backupTenant) return Promise.resolve(null);
            return Promise.resolve({
              status: 'READY',
              expires_at: null,
              deleted_at: null,
              manifest_r2_key: 'ready/manifest',
              wrapped_dek: new Uint8Array([1]).buffer,
              kek_version: 'kek-7',
              global_hash: 'a'.repeat(64),
            });
          }
          return Promise.resolve(null);
        }),
        all: vi.fn(() => {
          if (sql.includes('data_backup_chunks') && input.plaintextHash) {
            return Promise.resolve({
              results: [
                {
                  ordinal: 0,
                  nonce: input.nonce ?? new Uint8Array(12).buffer,
                  auth_tag: input.authTag ?? new Uint8Array(16).buffer,
                  r2_key: 'ready/chunk-0',
                  plaintext_hash: input.plaintextHash,
                },
              ],
            });
          }
          return Promise.resolve({ results: [] });
        }),
        run: vi.fn(() => {
          if (sql.includes('UPDATE authorization_tokens')) {
            consumedSql.push(sql);
            consumed.push(params);
            return Promise.resolve({ meta: { changes: params[2] === tokenHashCached ? 1 : 0 } });
          }
          return Promise.resolve({ meta: { changes: 1 } });
        }),
      })),
    })),
    batch: vi.fn().mockResolvedValue([]),
  };
  const bucket = {
    head: vi.fn().mockResolvedValue({ etag: 'manifest' }),
    get: vi
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(
          key === 'ready/chunk-0' && input.sealed
            ? { arrayBuffer: () => Promise.resolve(input.sealed!.buffer) }
            : null,
        ),
      ),
  };
  return { db, bucket, consumed, consumedSql };
}

let tokenHashCached = '';

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
  beforeAll(async () => {
    tokenHashCached = await tokenHash(token);
  });
  it('is default-off and does not expose routes', async () => {
    expect(isDataBackupEnabled(env({ FEATURE_DATA_BACKUP: undefined }))).toBe(false);
    await expect(
      runCreateBackupHttp(env({ FEATURE_DATA_BACKUP: undefined }), owner, {
        idempotencyKey: 'idem-1',
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('allows Owner/Admin export but restricts download and dry-run to Owner', async () => {
    const cashier = { ...owner, role: 'cashier' };
    const admin = { ...owner, userId: 'admin-a', role: 'admin' };
    await expect(
      runCreateBackupHttp(env(), cashier, { idempotencyKey: 'cashier' }),
    ).resolves.toMatchObject({ status: 403 });
    const dbFixture = downloadDb({});
    await expect(
      runCreateBackupHttp(env({ DB: dbFixture.db, BACKUPS: dbFixture.bucket }), admin, {
        idempotencyKey: 'admin',
      }),
    ).resolves.toMatchObject({ status: 202 });
    await expect(
      runDownloadBackupHttp(env(), admin, { backupId: 'backup-a' }),
    ).resolves.toMatchObject({ status: 403 });
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
    const fixture = downloadDb({ backupTenant: 'tenant-b' });
    await expect(
      runDownloadBackupHttp(env({ DB: fixture.db, BACKUPS: fixture.bucket }), owner, {
        backupId: 'backup-b',
        stepUpToken: token,
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });

  it('requires explicit permission and consumes a scoped hashed download step-up token', async () => {
    const fixture = downloadDb({});
    await expect(
      runDownloadBackupHttp(
        env({ DB: fixture.db, BACKUPS: fixture.bucket }),
        {
          ...owner,
          permissions: [],
        },
        { backupId: 'backup-a', stepUpToken: token },
      ),
    ).resolves.toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });
    await expect(
      runDownloadBackupHttp(env({ DB: fixture.db, BACKUPS: fixture.bucket }), owner, {
        backupId: 'backup-a',
      }),
    ).resolves.toMatchObject({ status: 401, body: { code: 'STEP_UP_REQUIRED' } });

    const allowed = await runDownloadBackupHttp(
      env({ DB: fixture.db, BACKUPS: fixture.bucket }),
      owner,
      { backupId: 'backup-a', stepUpToken: token },
    );
    expect(allowed.status).toBe(200);
    expect(fixture.consumed).toHaveLength(1);
    expect(fixture.consumed[0]).toContain(tokenHashCached);
    expect(fixture.consumed[0]).not.toContain(token);
    expect(fixture.consumed[0]).toEqual(
      expect.arrayContaining(['tenant-a', 'owner-a', 'DATA_BACKUP_DOWNLOAD', 'backup-a']),
    );
    expect(fixture.consumedSql[0]).toContain("created_at >= datetime('now', '-5 minutes')");
  });

  it('S42-H1: mint→consume end-to-end — el token emitido funciona en download (sin mocks)', async () => {
    // Mock con memoria: el mint INSERTA el hash; el consume UPDATE lo matchea.
    const mintedHashes: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...params: unknown[]) => ({
          first: vi.fn(() => {
            if (sql.includes('tenant_capabilities')) return Promise.resolve({ enabled: 1 });
            if (sql.includes('FROM data_backups')) {
              if (params[0] !== 'tenant-a') return Promise.resolve(null);
              return Promise.resolve({
                status: 'READY', expires_at: null, deleted_at: null,
                manifest_r2_key: 'ready/manifest',
                wrapped_dek: new Uint8Array([1]).buffer,
                kek_version: 'kek-7', global_hash: 'a'.repeat(64),
              });
            }
            return Promise.resolve(null);
          }),
          all: vi.fn(() => Promise.resolve({ results: [] })),
          run: vi.fn(() => {
            if (sql.includes('INSERT INTO authorization_tokens')) {
              const hash = params[2] as string;
              mintedHashes.push(hash);
              return Promise.resolve({ meta: { changes: 1 } });
            }
            if (sql.includes('UPDATE authorization_tokens')) {
              const hash = params[2] as string;
              const matched = mintedHashes.includes(hash);
              if (matched) mintedHashes.splice(mintedHashes.indexOf(hash), 1);
              return Promise.resolve({ meta: { changes: matched ? 1 : 0 } });
            }
            return Promise.resolve({ meta: { changes: 1 } });
          }),
        })),
      })),
      batch: vi.fn().mockResolvedValue([]),
    };
    const bucket = {
      head: vi.fn().mockResolvedValue({ etag: 'manifest' }),
      get: vi.fn().mockResolvedValue(null),
    };
    const fullEnv = env({ DB: db, BACKUPS: bucket });
    // Rol no autorizado → 403.
    const cashierMint = await runMintBackupStepUpTokenHttp(
      env({ DB: downloadDb({}).db, BACKUPS: downloadDb({}).bucket }),
      { ...owner, role: 'cashier' },
      { backupId: 'backup-a' },
    );
    expect(cashierMint.status).toBe(403);

    // Owner sin permiso → 403.
    const noPermMint = await runMintBackupStepUpTokenHttp(
      env({ DB: downloadDb({}).db, BACKUPS: downloadDb({}).bucket }),
      { ...owner, permissions: [] },
      { backupId: 'backup-a' },
    );
    expect(noPermMint.status).toBe(403);

    // Owner con permiso → 200 con token (el mint valida que el backup existe).
    const minted = await runMintBackupStepUpTokenHttp(fullEnv, owner, { backupId: 'backup-a' });
    expect(minted.status).toBe(200);
    const body = minted.body as { token?: string; expiresInSeconds?: number; oneShot?: boolean };
    expect(typeof body.token).toBe('string');
    expect(body.expiresInSeconds).toBe(90);
    expect(body.oneShot).toBe(true);

    // El token emitido SÍ es consumible por download (el UPDATE matchea por hash).
    const token = body.token!;
    const allowed = await runDownloadBackupHttp(fullEnv, owner, {
      backupId: 'backup-a',
      stepUpToken: token,
    });
    expect(allowed.status).toBe(200);
    // El token se consumió (one-shot): segundo uso → 401.
    const replay = await runDownloadBackupHttp(fullEnv, owner, {
      backupId: 'backup-a',
      stepUpToken: token,
    });
    expect(replay.status).toBe(401);
  });

  it('S42-H2: sin DB → 503 fail-closed en create y list (jamás 202/200 vacío)', async () => {
    const noDb = env({ DB: undefined }) as never;
    const created = await runCreateBackupHttp(noDb, owner, { idempotencyKey: 'k-no-db' });
    expect(created.status).toBe(503);
    const listed = await runListBackupsHttp(noDb, owner);
    expect(listed.status).toBe(503);
  });

  it('sanitizes persisted workflow failure details in list and status responses', async () => {
    const unsafe = {
      id: 'backup-failed',
      status: 'FAILED',
      error_code: 'SQLITE_ERROR: secret_table',
      error_ref: 'raw provider detail',
    };
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(() =>
            Promise.resolve(sql.includes('tenant_capabilities') ? { enabled: 1 } : unsafe),
          ),
          all: vi.fn(() => Promise.resolve({ results: [unsafe] })),
          run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
        })),
      })),
      batch: vi.fn().mockResolvedValue([]),
    };
    const scoped = env({ DB: db });
    await expect(runListBackupsHttp(scoped, owner)).resolves.toMatchObject({
      body: {
        items: [
          {
            error_code: 'BACKUP_EXPORT_FAILED',
            error_ref: null,
          },
        ],
      },
    });
    await expect(
      runBackupStatusHttp(scoped, owner, { backupId: 'backup-failed' }),
    ).resolves.toMatchObject({
      body: { error_code: 'BACKUP_EXPORT_FAILED', error_ref: null },
    });
  });
});

describe('data.backup Workflow, R2 and KMS contracts', () => {
  it('uses versioned KMS wrapping and fails closed when KMS is unavailable', async () => {
    const fixture = downloadDb({});
    const unavailable = env({
      DB: fixture.db,
      BACKUPS: fixture.bucket,
      BACKUP_KMS: {
        wrap: vi.fn().mockRejectedValue(new Error('provider details must stay opaque')),
      },
    });
    await expect(
      runBackupWorkflow(unavailable, { tenantId: 'tenant-a', backupId: 'backup-a' }),
    ).rejects.toMatchObject({ code: 'BACKUP_KMS_UNAVAILABLE' });
    const status = await runDownloadBackupHttp(unavailable, owner, {
      backupId: 'backup-a',
      stepUpToken: token,
    });
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
    const fixture = downloadDb({});
    const response = await runDownloadBackupHttp(
      env({ DB: fixture.db, BACKUPS: fixture.bucket }),
      owner,
      { backupId: 'backup-ready', stepUpToken: token },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(response.metrics.maxBufferedBytes).toBeLessThanOrEqual(4 * 1024 * 1024 + 16);
  });

  it('fails closed before emitting plaintext when D1 unit hash metadata mismatches', async () => {
    const dek = new Uint8Array(32).fill(9);
    const aad = {
      tenant_id: 'tenant-a',
      backup_id: 'backup-ready',
      format: 'KPBK1' as const,
      kind: 'TABLE' as const,
      ordinal: 0,
    };
    const encrypted = await encryptKpbk1Unit(new TextEncoder().encode('secret-row\n'), dek, aad);
    const sealed = new Uint8Array(encrypted.ciphertext.length + encrypted.authTag.length);
    sealed.set(encrypted.ciphertext);
    sealed.set(encrypted.authTag, encrypted.ciphertext.length);
    const fixture = downloadDb({
      plaintextHash: '0'.repeat(64),
      sealed,
      nonce: encrypted.nonce.buffer as ArrayBuffer,
      authTag: encrypted.authTag.buffer as ArrayBuffer,
    });
    const response = await runDownloadBackupHttp(
      env({
        DB: fixture.db,
        BACKUPS: fixture.bucket,
        BACKUP_KMS: { unwrapDek: vi.fn().mockResolvedValue(dek) },
      }),
      owner,
      { backupId: 'backup-ready', stepUpToken: token },
    );
    expect(response.status).toBe(200);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await expect(reader.read()).resolves.toMatchObject({
      value: new TextEncoder().encode('KPBK1\n'),
    });
    await expect(reader.read()).rejects.toThrow('BACKUP_CHUNK_TAMPERED');
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
          run: vi.fn(() =>
            Promise.resolve({
              meta: { changes: sql.includes('UPDATE authorization_tokens') ? 1 : 0 },
            }),
          ),
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
      {
        backupId: 'backup-ready',
        idempotencyKey: 'restore-async-1',
        stepUpToken: token,
      },
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
          run: vi.fn(() =>
            Promise.resolve({
              meta: { changes: sql.includes('UPDATE authorization_tokens') ? 1 : 0 },
            }),
          ),
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
      {
        backupId: 'backup-ready',
        idempotencyKey: 'restore-failed-1',
        stepUpToken: token,
      },
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

describe('backup workflow error disclosure', () => {
  it('maps internal exception details to allowlisted BACKUP codes only', () => {
    expect(safeBackupErrorCode(new Error('SQLITE_ERROR: no such table secrets'))).toBe(
      'BACKUP_EXPORT_FAILED',
    );
    expect(safeBackupErrorCode(new Error('BACKUP_EPOCH_DRIFT'))).toBe('BACKUP_EPOCH_DRIFT');
    expect(safeBackupErrorCode({ code: 'BACKUP_KMS_UNAVAILABLE' })).toBe('BACKUP_KMS_UNAVAILABLE');
  });
});
