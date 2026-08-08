/* eslint-disable no-secrets/no-secrets -- protocol error codes are not secrets */
import {
  D1_BACKUP_REGISTRY_VERSION,
  D1_BACKUP_TABLES,
  appendBackupAudit,
  createBackupSnapshotReader,
  runD1AtomicPlan,
} from '@kipuspay/adapters-d1';
import { canonicalJson, encryptKpbk1Unit } from '@kipuspay/domain-integrations';
import { runBackupExportAttempt, type BackupExportResult } from './backup-export.js';
import {
  createBackupR2Port,
  type BackupMultipartCheckpoint,
  type BackupR2PutInput,
} from './backup-r2.js';
import type { BackupKmsBinding } from './backup-workflow.js';

export interface BackupWorkflowParams {
  readonly tenantId: string;
  readonly backupId: string;
}

export interface BackupWorkflowPhaseEnv {
  readonly DB: D1Database;
  readonly BACKUPS: R2Bucket;
  readonly BACKUP_KMS: BackupKmsBinding;
}

const encoder = new TextEncoder();

function errorCode(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'BACKUP_EXPORT_FAILED';
}

async function wrapDek(env: BackupWorkflowPhaseEnv, params: BackupWorkflowParams, dek: Uint8Array) {
  if (env.BACKUP_KMS.wrapDek) return env.BACKUP_KMS.wrapDek({ ...params, dek });
  if (env.BACKUP_KMS.wrap) return env.BACKUP_KMS.wrap({ ...params, dek });
  throw new Error('BACKUP_KMS_UNAVAILABLE');
}

async function unwrapDek(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  wrappedDek: Uint8Array,
  kekVersion: string,
): Promise<Uint8Array> {
  if (env.BACKUP_KMS.unwrapDek) {
    return env.BACKUP_KMS.unwrapDek({ ...params, wrappedDek, kekVersion });
  }
  if (env.BACKUP_KMS.unwrap) {
    return env.BACKUP_KMS.unwrap({ ...params, wrappedDek, kekVersion });
  }
  throw new Error('BACKUP_KMS_UNAVAILABLE');
}

async function loadDek(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
): Promise<Uint8Array> {
  const row = await env.DB.prepare(
    `SELECT wrapped_dek, kek_version FROM data_backups WHERE tenant_id = ? AND id = ?`,
  )
    .bind(params.tenantId, params.backupId)
    .first<{ wrapped_dek: ArrayBuffer | null; kek_version: string | null }>();
  if (row?.wrapped_dek && row.kek_version) {
    return unwrapDek(env, params, new Uint8Array(row.wrapped_dek), row.kek_version);
  }
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(env, params, dek);
  await env.DB.prepare(
    `UPDATE data_backups SET wrapped_dek = ?, kek_version = ?
     WHERE tenant_id = ? AND id = ?`,
  )
    .bind(wrapped.wrappedDek, wrapped.kekVersion, params.tenantId, params.backupId)
    .run();
  return dek;
}

type CheckpointMap = Readonly<Record<string, BackupMultipartCheckpoint>>;

async function readCheckpoints(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
): Promise<CheckpointMap> {
  const row = await env.DB.prepare(
    `SELECT multipart_upload_ref FROM data_backups WHERE tenant_id = ? AND id = ?`,
  )
    .bind(params.tenantId, params.backupId)
    .first<{ multipart_upload_ref: string | null }>();
  if (!row?.multipart_upload_ref) return {};
  try {
    return JSON.parse(row.multipart_upload_ref) as CheckpointMap;
  } catch {
    throw new Error('BACKUP_MULTIPART_CHECKPOINT_INVALID');
  }
}

async function writeCheckpoints(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  checkpoints: CheckpointMap,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE data_backups SET multipart_upload_ref = ?
     WHERE tenant_id = ? AND id = ?`,
  )
    .bind(
      Object.keys(checkpoints).length === 0 ? null : JSON.stringify(checkpoints),
      params.tenantId,
      params.backupId,
    )
    .run();
}

export async function cleanupBackupAttempt(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
): Promise<void> {
  const port = createBackupR2Port(env.BACKUPS);
  const checkpoints = await readCheckpoints(env, params);
  await Promise.all(
    Object.entries(checkpoints).map(([key, checkpoint]) =>
      port.abort(key, checkpoint.uploadId).catch(() => undefined),
    ),
  );
  let cursor: string | undefined;
  do {
    const partials = await port.listPartials(
      `staging/${params.tenantId}/${params.backupId}/`,
      cursor,
    );
    await Promise.all(partials.objects.map((object) => port.delete(object.key)));
    cursor = partials.truncated ? partials.cursor : undefined;
  } while (cursor);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM data_backup_chunks WHERE tenant_id = ? AND backup_id = ?`).bind(
      params.tenantId,
      params.backupId,
    ),
    env.DB.prepare(`DELETE FROM data_backup_objects WHERE tenant_id = ? AND backup_id = ?`).bind(
      params.tenantId,
      params.backupId,
    ),
    env.DB.prepare(
      `DELETE FROM data_backup_table_manifests WHERE tenant_id = ? AND backup_id = ?`,
    ).bind(params.tenantId, params.backupId),
    env.DB.prepare(
      `UPDATE data_backups SET multipart_upload_ref = NULL
       WHERE tenant_id = ? AND id = ?`,
    ).bind(params.tenantId, params.backupId),
  ]);
}

async function destination(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  input: BackupR2PutInput,
) {
  const existing = await env.BACKUPS.head(input.key);
  if (existing?.customMetadata?.ciphertextHash === input.sha256) {
    return { etag: existing.etag, multipart: false };
  }
  const port = createBackupR2Port(env.BACKUPS);
  const checkpoints = await readCheckpoints(env, params);
  const original = checkpoints[input.key];
  const uploaded = await port.putEncrypted(
    {
      ...input,
      onCheckpoint: async (checkpoint) => {
        await writeCheckpoints(env, params, {
          ...(await readCheckpoints(env, params)),
          [input.key]: checkpoint,
        });
      },
    },
    original,
  );
  const latest = { ...(await readCheckpoints(env, params)) };
  delete latest[input.key];
  await writeCheckpoints(env, params, latest);
  return uploaded;
}

async function persistExport(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  exported: BackupExportResult,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM data_backup_chunks WHERE tenant_id = ? AND backup_id = ?`).bind(
      params.tenantId,
      params.backupId,
    ),
    env.DB.prepare(`DELETE FROM data_backup_objects WHERE tenant_id = ? AND backup_id = ?`).bind(
      params.tenantId,
      params.backupId,
    ),
    env.DB.prepare(
      `DELETE FROM data_backup_table_manifests WHERE tenant_id = ? AND backup_id = ?`,
    ).bind(params.tenantId, params.backupId),
  ]);
  for (const table of exported.tables) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO data_backup_table_manifests (
           id, tenant_id, backup_id, table_name, classification, pk_json, columns_json,
           row_count, plaintext_size_bytes, chunk_count, table_hash
         ) VALUES (?, ?, ?, ?, 'BUSINESS', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${params.backupId}:table:${table.name}`,
        params.tenantId,
        params.backupId,
        table.name,
        canonicalJson(
          D1_BACKUP_TABLES.find((entry) => entry.name === table.name)?.primaryKey ?? [],
        ),
        canonicalJson(D1_BACKUP_TABLES.find((entry) => entry.name === table.name)?.columns ?? []),
        table.rowCount,
        table.plaintextSize,
        table.chunks.length,
        table.hash,
      ),
      ...table.chunks.map((chunk) =>
        env.DB.prepare(
          `INSERT INTO data_backup_chunks (
             id, tenant_id, backup_id, table_name, ordinal, row_count,
             plaintext_size_bytes, ciphertext_size_bytes, plaintext_hash, ciphertext_hash,
             nonce, auth_tag, r2_key
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `${params.backupId}:${table.name}:${chunk.ordinal}`,
          params.tenantId,
          params.backupId,
          table.name,
          chunk.ordinal,
          chunk.rowCount,
          chunk.plaintextSize,
          chunk.ciphertextSize,
          chunk.plaintextHash,
          chunk.ciphertextHash,
          chunk.nonce,
          chunk.authTag,
          chunk.key,
        ),
      ),
    ]);
  }
  if (exported.objects.length > 0) {
    await env.DB.batch(
      exported.objects.map((object) =>
        env.DB.prepare(
          `INSERT INTO data_backup_objects (
             id, tenant_id, backup_id, ordinal, source_r2_key, backup_r2_key, source_etag,
             plaintext_size_bytes, ciphertext_size_bytes, plaintext_hash, ciphertext_hash,
             nonce, auth_tag
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `${params.backupId}:object:${object.ordinal}`,
          params.tenantId,
          params.backupId,
          object.ordinal,
          object.sourceR2Key,
          object.key,
          object.sourceEtag,
          object.plaintextSize,
          object.ciphertextSize,
          object.plaintextHash,
          object.ciphertextHash,
          object.nonce,
          object.authTag,
        ),
      ),
    );
  }
}

// Verification deliberately keeps every fail-closed invariant explicit.
// eslint-disable-next-line complexity
async function verifyExport(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  exported: BackupExportResult,
): Promise<void> {
  const epoch = await env.DB.prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
    .bind(params.tenantId)
    .first<{ epoch: number }>();
  if (epoch?.epoch !== exported.epoch) throw new Error('BACKUP_EPOCH_DRIFT');
  for (const table of exported.tables) {
    for (const chunk of table.chunks) {
      const head = await env.BACKUPS.head(chunk.key);
      if (
        !head ||
        head.etag !== chunk.etag ||
        head.customMetadata?.ciphertextHash !== chunk.ciphertextHash
      ) {
        throw new Error('BACKUP_R2_ETAG_DRIFT');
      }
    }
  }
  for (const object of exported.objects) {
    const source = await env.BACKUPS.head(object.sourceR2Key);
    const copied = await env.BACKUPS.head(object.key);
    if (
      !source ||
      source.etag !== object.sourceEtag ||
      !copied ||
      copied.etag !== object.etag ||
      copied.customMetadata?.ciphertextHash !== object.ciphertextHash
    ) {
      throw new Error('BACKUP_SOURCE_OBJECT_CHANGED');
    }
  }
  const counts = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM data_backup_table_manifests WHERE tenant_id = ? AND backup_id = ?) AS tables_count,
       (SELECT COALESCE(SUM(row_count), 0) FROM data_backup_table_manifests WHERE tenant_id = ? AND backup_id = ?) AS row_count,
       (SELECT COUNT(*) FROM data_backup_chunks WHERE tenant_id = ? AND backup_id = ?) AS chunk_count,
       (SELECT COUNT(*) FROM data_backup_objects WHERE tenant_id = ? AND backup_id = ?) AS object_count`,
  )
    .bind(
      params.tenantId,
      params.backupId,
      params.tenantId,
      params.backupId,
      params.tenantId,
      params.backupId,
      params.tenantId,
      params.backupId,
    )
    .first<{
      tables_count: number;
      row_count: number;
      chunk_count: number;
      object_count: number;
    }>();
  if (
    counts?.tables_count !== exported.tables.length ||
    counts.row_count !== exported.rowCount ||
    counts.chunk_count !== exported.chunkCount ||
    counts.object_count !== exported.objects.length
  ) {
    throw new Error('BACKUP_EXPORT_COUNT_MISMATCH');
  }
}

export async function executeBackupAttempt(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
): Promise<BackupExportResult> {
  const epoch = await env.DB.prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
    .bind(params.tenantId)
    .first<{ epoch: number }>();
  if (!epoch) throw new Error('BACKUP_EPOCH_UNAVAILABLE');
  await env.DB.prepare(
    `UPDATE data_backups SET status = 'UPLOADING', snapshot_epoch = ?
     WHERE tenant_id = ? AND id = ? AND status IN ('SNAPSHOTTING','UPLOADING')`,
  )
    .bind(epoch.epoch, params.tenantId, params.backupId)
    .run();
  const dek = await loadDek(env, params);
  const reader = createBackupSnapshotReader({ db: env.DB });
  try {
    const exported = await runBackupExportAttempt({
      ...params,
      epoch: epoch.epoch,
      schemaVersion: '0035',
      registryVersion: D1_BACKUP_REGISTRY_VERSION,
      exclusions: [
        ...D1_BACKUP_TABLES.filter(
          (
            entry,
          ): entry is (typeof D1_BACKUP_TABLES)[number] & {
            classification: 'DERIVED' | 'EPHEMERAL' | 'SECRET';
          } => entry.classification !== 'BUSINESS',
        ).map((entry) => ({
          name: entry.name,
          classification: entry.classification,
          reason: entry.reason ?? 'classified exclusion',
          known_count: null,
        })),
        {
          name: 'unsynced_indexeddb',
          classification: 'EPHEMERAL' as const,
          reason: 'client state not synchronized to authoritative storage',
          known_count: null,
        },
      ].sort((left, right) => left.name.localeCompare(right.name)),
      dek,
      registry: D1_BACKUP_TABLES.filter(
        (entry): entry is (typeof D1_BACKUP_TABLES)[number] & { classification: 'BUSINESS' } =>
          entry.classification === 'BUSINESS',
      ),
      readTablePage: reader.readTablePage,
      source: {
        head: async (key) => {
          const object = await env.BACKUPS.head(key);
          return object ? { etag: object.etag, size: object.size } : null;
        },
        get: (key) => env.BACKUPS.get(key),
      },
      destination: { putEncrypted: (input) => destination(env, params, input) },
    });
    await persistExport(env, params, exported);
    await verifyExport(env, params, exported);
    return exported;
  } catch (cause) {
    const code = errorCode(cause);
    if (
      code === 'BACKUP_EPOCH_DRIFT' ||
      code === 'BACKUP_SOURCE_OBJECT_CHANGED' ||
      code === 'BACKUP_R2_ETAG_DRIFT' ||
      code === 'BACKUP_EXPORT_COUNT_MISMATCH'
    ) {
      await cleanupBackupAttempt(env, params);
    }
    throw cause;
  }
}

export async function publishBackupManifest(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  exported: BackupExportResult,
): Promise<{ readonly key: string; readonly etag: string }> {
  await verifyExport(env, params, exported);
  const dek = await loadDek(env, params);
  const plaintext = encoder.encode(canonicalJson(exported.manifest));
  const encrypted = await encryptKpbk1Unit(plaintext, dek, {
    tenant_id: params.tenantId,
    backup_id: params.backupId,
    format: 'KPBK1',
    kind: 'MANIFEST',
    ordinal: 0,
  });
  const sealed = new Uint8Array(encrypted.ciphertext.byteLength + encrypted.authTag.byteLength);
  sealed.set(encrypted.ciphertext);
  sealed.set(encrypted.authTag, encrypted.ciphertext.byteLength);
  const key = `ready/${params.tenantId}/${params.backupId}/manifest.kpbk1`;
  const object = await env.BACKUPS.put(key, sealed, {
    customMetadata: {
      backupId: params.backupId,
      globalHash: exported.globalHash,
      nonce: encrypted.nonceHex,
      publication: 'READY',
    },
  });
  if (!object) throw new Error('BACKUP_MANIFEST_PUBLISH_FAILED');
  return { key, etag: object.etag };
}

export async function finalizeBackupReady(
  env: BackupWorkflowPhaseEnv,
  params: BackupWorkflowParams,
  exported: BackupExportResult,
  manifest: { readonly key: string; readonly etag: string },
): Promise<void> {
  await verifyExport(env, params, exported);
  const marker = await env.BACKUPS.head(manifest.key);
  if (
    !marker ||
    marker.etag !== manifest.etag ||
    marker.customMetadata?.globalHash !== exported.globalHash
  ) {
    throw new Error('BACKUP_MANIFEST_VERIFY_FAILED');
  }
  await runD1AtomicPlan(
    env.DB,
    (plan) => {
      plan.guardState(
        `SELECT 1 FROM data_backups AS b
         JOIN tenant_data_epochs AS e ON e.tenant_id = b.tenant_id
         WHERE b.tenant_id = ? AND b.id = ? AND b.status = 'UPLOADING'
           AND b.snapshot_epoch = e.epoch`,
        [params.tenantId, params.backupId],
      );
      plan.add(
        env.DB.prepare(
          `UPDATE data_backups
           SET status = 'READY', manifest_r2_key = ?, ready_at = CURRENT_TIMESTAMP,
               global_hash = ?, plaintext_size_bytes = ?, ciphertext_size_bytes = ?,
               chunk_count = ?, object_count = ?, multipart_upload_ref = NULL
           WHERE tenant_id = ? AND id = ? AND status = 'UPLOADING'`,
        ).bind(
          manifest.key,
          exported.globalHash,
          exported.tables.reduce((sum, table) => sum + table.plaintextSize, 0) +
            exported.objects.reduce((sum, object) => sum + object.plaintextSize, 0),
          exported.tables
            .flatMap((table) => table.chunks)
            .reduce((sum, chunk) => sum + chunk.ciphertextSize, 0) +
            exported.objects.reduce((sum, object) => sum + object.ciphertextSize, 0),
          exported.chunkCount,
          exported.objects.length,
          params.tenantId,
          params.backupId,
        ),
      );
    },
    { guardId: `backup-ready:${params.tenantId}:${params.backupId}` },
  );
  const backup = await env.DB.prepare(
    `SELECT created_by_user_id FROM data_backups WHERE tenant_id = ? AND id = ?`,
  )
    .bind(params.tenantId, params.backupId)
    .first<{ created_by_user_id: string }>();
  await appendBackupAudit(env.DB, {
    tenantId: params.tenantId,
    actorUserId: backup?.created_by_user_id ?? null,
    action: 'BACKUP_READY',
    backupId: params.backupId,
    payload: {
      backupId: params.backupId,
      globalHash: exported.globalHash,
      manifestEtag: manifest.etag,
    },
  });
}
