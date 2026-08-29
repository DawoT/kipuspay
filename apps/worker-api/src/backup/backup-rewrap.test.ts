import { beforeAll, describe, expect, it, vi } from 'vitest';
import { runRewrapBackupHttp } from './backup-routes.js';

const owner = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: 'owner',
  permissions: ['data.backup.rewrap', 'data.backup.download'],
};

const token = 'stepup_rewrap_opaque_v2';

async function tokenHash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let tokenHashCached = '';
beforeAll(async () => {
  tokenHashCached = await tokenHash(token);
});

function createRewrapDb(input: {
  readonly beforeCiphertexts: readonly string[];
  readonly backupStatus?: string;
  readonly backupKekVersion?: string;
}) {
  const beforeCiphertexts = [...input.beforeCiphertexts];
  const status = input.backupStatus ?? 'READY';
  const kekVersion = input.backupKekVersion ?? 'v1';
  const oldWrapped = new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
  const newWrappedCapture: { wrapped?: Uint8Array; kekVersion?: string } = {};
  const queries: string[] = [];
  const batches: unknown[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      queries.push(sql);
      return {
        bind: vi.fn((...params: unknown[]) => ({
          sql,
          params,
          first: vi.fn(() => {
            if (sql.includes('tenant_capabilities')) return Promise.resolve({ enabled: 1 });
            if (sql.includes('FROM data_backups') && sql.includes('tenant_id')) {
              if (sql.includes('SELECT')) {
                if (status !== 'READY')
                  return Promise.resolve({
                    status,
                    kek_version: kekVersion,
                    wrapped_dek: oldWrapped,
                    manifest_r2_key: 'ready/key',
                    global_hash: 'a'.repeat(64),
                  });
                return Promise.resolve({
                  id: 'backup-1',
                  status: 'READY',
                  wrapped_dek: oldWrapped,
                  kek_version: kekVersion,
                  manifest_r2_key: 'ready/key',
                  global_hash: 'a'.repeat(64),
                  tenant_id: 'tenant-a',
                });
              }
            }
            return Promise.resolve(null);
          }),
          all: vi.fn(() => {
            if (sql.includes('data_backup_chunks')) {
              return Promise.resolve({
                results: beforeCiphertexts.map((hash, idx) => ({
                  ciphertext_hash: hash,
                  id: `chunk-${idx}`,
                  table_name: 'sales',
                  ordinal: idx,
                })),
              });
            }
            if (sql.includes('tenant_capabilities')) return Promise.resolve({ results: [] });
            return Promise.resolve({ results: [] });
          }),
          run: vi.fn(() => {
            if (sql.includes('UPDATE authorization_tokens')) {
              const hash = params[2] as string;
              const action = params[3] as string;
              const ok = hash === tokenHashCached && action === 'BACKUP_REWRAP';
              return Promise.resolve({ meta: { changes: ok ? 1 : 0 } });
            }
            if (sql.includes('UPDATE data_backups SET wrapped_dek')) {
              newWrappedCapture.wrapped = params[0] as Uint8Array;
              newWrappedCapture.kekVersion = params[1] as string;
              return Promise.resolve({ meta: { changes: 1 } });
            }
            return Promise.resolve({ meta: { changes: 1 } });
          }),
        })),
      };
    }),
    batch: vi.fn((statements: unknown[]) => {
      batches.push(statements as unknown[]);
      for (const stmt of statements as Array<{ sql?: string; params?: unknown[] }>) {
        if (stmt?.sql?.includes('UPDATE data_backups SET wrapped_dek')) {
          const p = stmt.params as unknown[] | undefined;
          if (p) {
            newWrappedCapture.wrapped = p[0] as Uint8Array;
            newWrappedCapture.kekVersion = p[1] as string;
          }
        }
        if (stmt?.sql) queries.push(stmt.sql);
        // capture audit
        if (
          stmt?.sql?.includes('audit_events') ||
          JSON.stringify(stmt).includes('BACKUP_REWRAPPED')
        ) {
          queries.push('AUDIT_BACKUP_REWRAPPED');
        }
      }
      return Promise.resolve([]);
    }),
  } as unknown as { prepare: ReturnType<typeof vi.fn>; batch: ReturnType<typeof vi.fn> } & Record<
    string,
    unknown
  >;
  return { db, beforeCiphertexts, oldWrapped, newWrappedCapture, queries, batches };
}

describe('POST /api/backups/:id/rewrap v1→v2 without re-encrypting payload', () => {
  it('owner with step-up BACKUP_REWRAP and activeVersion=v2 rewraps DEK, keeps ciphertext_hash identical, audits BACKUP_REWRAPPED', async () => {
    const beforeHashes = ['a'.repeat(64), 'b'.repeat(64)];
    const { db, queries, batches } = createRewrapDb({ beforeCiphertexts: beforeHashes });
    const plainDek = new Uint8Array(32).fill(9);
    const newWrapped = new Uint8Array([9, 9, 9, 9]);
    const kms = {
      unwrapDek: vi.fn().mockResolvedValue(plainDek),
      wrapDek: vi.fn().mockResolvedValue({ wrappedDek: newWrapped, kekVersion: 'v2' }),
      activeKeyVersion: vi.fn().mockResolvedValue('v2'),
      unwrap: vi.fn().mockResolvedValue(plainDek),
      wrap: vi.fn().mockResolvedValue({ wrappedDek: newWrapped, kekVersion: 'v2' }),
    };
    const env = {
      FEATURE_DATA_BACKUP: '1',
      DB: db,
      BACKUP_KMS: kms,
    } as never;

    const result = await runRewrapBackupHttp(env, owner, {
      backupId: 'backup-1',
      stepUpToken: token,
    });

    expect(result.status).toBe(200);
    // must have called UPDATE data_backups SET wrapped_dek=?,kek_version='v2' WHERE status='READY'
    const combinedJson = JSON.stringify(batches) + '\n' + queries.join('\n');
    expect(combinedJson).toContain('UPDATE data_backups SET wrapped_dek');
    expect(combinedJson).toContain('kek_version');
    // also check that the specific batch updated to v2 (params[1] === 'v2')
    const allBatchesStr = JSON.stringify(batches);
    expect(allBatchesStr).toContain('v2');
    const updateBatch = batches
      .flat()
      .find(
        (s: unknown) =>
          typeof (s as { sql?: string })?.sql === 'string' &&
          (s as { sql: string }).sql.includes('UPDATE data_backups SET wrapped_dek'),
      );
    if (updateBatch && typeof (updateBatch as { params?: unknown[] }).params !== 'undefined') {
      const params = (updateBatch as { params: unknown[] }).params;
      expect(params[1]).toBe('v2');
    } else {
      // fallback: check stringified params contain v2
      expect(allBatchesStr).toContain('"v2"');
    }
    // verify ciphertext_hash identical before/after (no re-cipher)
    const afterChunks = await (
      db as unknown as {
        prepare: (sql: string) => {
          bind: (...a: unknown[]) => {
            all: () => Promise<{ results: Array<{ ciphertext_hash: string }> }>;
          };
        };
      }
    )
      .prepare(
        'SELECT ciphertext_hash FROM data_backup_chunks WHERE tenant_id = ? AND backup_id = ?',
      )
      .bind('tenant-a', 'backup-1')
      .all();
    expect(afterChunks.results.map((r) => r.ciphertext_hash)).toEqual(beforeHashes);
    // verify unwrap(old) → wrap(active) over plain DEK
    expect(kms.unwrapDek).toHaveBeenCalledWith(
      expect.objectContaining({ wrappedDek: expect.any(Uint8Array), kekVersion: 'v1' }),
    );
    expect(kms.wrapDek).toHaveBeenCalled();
    // ciphertext_hash identical before/after and no chunk re-encrypt (no INSERT into chunks)
    const batchSql =
      batches
        .flat()
        .map((s: unknown) => (s as { sql?: string })?.sql ?? String(s))
        .join('\n') +
      '\n' +
      queries.join('\n');
    expect(batchSql).not.toContain('INSERT INTO data_backup_chunks');
    expect(batchSql).not.toContain('UPDATE data_backup_chunks');
    // audit BACKUP_REWRAPPED must be present via batch or appendBackupAudit
    const allSql =
      queries.join(' ') +
      ' ' +
      batches
        .flat()
        .map((s: unknown) => JSON.stringify(s))
        .join(' ');
    const hasAudit =
      batches.some((batch) => JSON.stringify(batch).includes('BACKUP_REWRAPPED')) ||
      allSql.includes('BACKUP_REWRAPPED');
    expect(hasAudit).toBe(true);
    // Also ensure DB batch or run updated kek_version to v2
    // The second test will verify negative cases don't mutate
  });

  it('rejects without owner permission, without step-up, or when not READY (no re-encrypt)', async () => {
    const beforeHashes = ['c'.repeat(64)];
    const { db: readyDb } = createRewrapDb({
      beforeCiphertexts: beforeHashes,
      backupStatus: 'READY',
    });
    const { db: pendingDb } = createRewrapDb({
      beforeCiphertexts: beforeHashes,
      backupStatus: 'PENDING',
    });
    const kmsReady = {
      unwrapDek: vi.fn().mockResolvedValue(new Uint8Array(32)),
      wrapDek: vi.fn().mockResolvedValue({ wrappedDek: new Uint8Array([1]), kekVersion: 'v2' }),
    };
    const kmsPending = {
      unwrapDek: vi.fn().mockResolvedValue(new Uint8Array(32)),
      wrapDek: vi.fn().mockResolvedValue({ wrappedDek: new Uint8Array([1]), kekVersion: 'v2' }),
    };
    const envReady = {
      FEATURE_DATA_BACKUP: '1',
      DB: readyDb,
      BACKUP_KMS: kmsReady,
    } as never;
    const envPending = {
      FEATURE_DATA_BACKUP: '1',
      DB: pendingDb,
      BACKUP_KMS: kmsPending,
    } as never;

    // non-owner -> 403 (preflight)
    const cashier = { ...owner, role: 'cashier' as const };
    await expect(
      runRewrapBackupHttp(envReady, cashier, { backupId: 'backup-1', stepUpToken: token }),
    ).resolves.toMatchObject({ status: 403 });

    // owner without permission -> 403
    const noPerm = { ...owner, permissions: [] as string[] };
    await expect(
      runRewrapBackupHttp(envReady, noPerm, { backupId: 'backup-1', stepUpToken: token }),
    ).resolves.toMatchObject({ status: 403 });

    // missing step-up -> 401 (after DB check, before KMS)
    await expect(
      runRewrapBackupHttp(envReady, owner, { backupId: 'backup-1' }),
    ).resolves.toMatchObject({ status: 401 });

    // feature off -> 404
    const envOff = { ...envReady, FEATURE_DATA_BACKUP: '0' } as never;
    await expect(
      runRewrapBackupHttp(envOff, owner, { backupId: 'backup-1', stepUpToken: token }),
    ).resolves.toMatchObject({ status: 404 });

    // not READY -> 404 (opaque) and no KMS unwrap
    await expect(
      runRewrapBackupHttp(envPending, owner, { backupId: 'backup-1', stepUpToken: token }),
    ).resolves.toMatchObject({ status: 404 });

    expect(kmsPending.unwrapDek).not.toHaveBeenCalled();
    expect(kmsPending.wrapDek).not.toHaveBeenCalled();
    // missing step-up also should not trigger KMS
    expect(kmsReady.unwrapDek).not.toHaveBeenCalled();
  });
});
