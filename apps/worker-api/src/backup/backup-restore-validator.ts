import {
  D1_BACKUP_REGISTRY_VERSION,
  D1_BACKUP_TABLES,
  createBackupSnapshotReader,
  verifyRestoreDryRun,
  type RestoreDryRunVerificationInput,
} from '@kipuspay/adapters-d1';
import {
  decryptKpbk1Unit,
  parseKpbk1Jsonl,
  parseKpbk1Manifest,
  type BackupRegistry,
  type BackupRow,
  type EncryptedKpbk1Unit,
} from '@kipuspay/domain-integrations';
import type { BackupKmsBinding } from './backup-workflow.js';

export interface BackupBucketLike {
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    customMetadata?: Record<string, string | undefined> | null;
  } | null>;
}

interface ValidationEnv {
  readonly DB: D1Database;
  readonly BACKUPS: BackupBucketLike;
  readonly BACKUP_KMS: BackupKmsBinding;
}

interface BackupControlRow {
  readonly manifest_r2_key: string;
  readonly wrapped_dek: ArrayBuffer;
  readonly kek_version: string;
  readonly schema_version: string;
  readonly registry_version: string;
  readonly global_hash: string;
}

interface ChunkControlRow {
  readonly table_name: string;
  readonly ordinal: number;
  readonly nonce: ArrayBuffer;
  readonly auth_tag: ArrayBuffer;
  readonly r2_key: string;
  readonly plaintext_hash: string;
  readonly ciphertext_hash: string;
}

interface ObjectControlRow {
  readonly ordinal: number;
  readonly source_r2_key: string;
  readonly backup_r2_key: string;
  readonly nonce: ArrayBuffer;
  readonly auth_tag: ArrayBuffer;
  readonly plaintext_hash: string;
  readonly ciphertext_hash: string;
}

function codedError(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code });
}

function bytesFromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw codedError(['BACKUP', 'MANIFEST', 'INVALID'].join('_'));
  }
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function domainRegistry(): BackupRegistry {
  return {
    version: D1_BACKUP_REGISTRY_VERSION,
    tables: D1_BACKUP_TABLES.map((entry) =>
      entry.classification === 'BUSINESS'
        ? {
            name: entry.name,
            classification: entry.classification,
            primaryKey: entry.primaryKey,
            columns: entry.columns,
            r2References: entry.r2References,
            tenantVia: entry.tenantVia,
          }
        : {
            name: entry.name,
            classification: entry.classification,
            reason: entry.reason ?? 'classified exclusion',
            tenantVia: entry.tenantVia,
          },
    ),
  };
}

export function parseChecks(
  sql: string | null,
): RestoreDryRunVerificationInput['schema']['tables'][string]['checks'] {
  if (!sql) return [];
  const checks: {
    column: string;
    operator: '>=' | '>' | '<=' | '<' | '=' | 'IN';
    value: number | string | readonly (number | string)[];
  }[] = [];
  for (const match of sql.matchAll(
    /CHECK\s*\(\s*"?([a-z0-9_]+)"?\s*(>=|<=|>|<|=)\s*(-?\d+|'[^']*')\s*\)/gi,
  )) {
    const raw = match[3] ?? '';
    checks.push({
      column: match[1] ?? '',
      operator: match[2] as '>=' | '>' | '<=' | '<' | '=',
      value: raw.startsWith("'") ? raw.slice(1, -1) : Number(raw),
    });
  }
  for (const match of sql.matchAll(/CHECK\s*\(\s*"?([a-z0-9_]+)"?\s+IN\s*\(([^)]+)\)\s*\)/gi)) {
    checks.push({
      column: match[1] ?? '',
      operator: 'IN',
      value: (match[2] ?? '')
        .split(',')
        .map((value) => value.trim())
        .map((value) => (value.startsWith("'") ? value.slice(1, -1) : Number(value))),
    });
  }
  return checks;
}

async function readSchema(
  db: D1Database,
  version: string,
): Promise<RestoreDryRunVerificationInput['schema']> {
  const tables: Record<string, RestoreDryRunVerificationInput['schema']['tables'][string]> = {};
  for (const entry of D1_BACKUP_TABLES.filter((table) => table.classification === 'BUSINESS')) {
    const definition = await db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .bind(entry.name)
      .first<{ sql: string | null }>();
    const columns = await db
      .prepare(`SELECT name, type, "notnull" AS not_null FROM pragma_table_info(?) ORDER BY cid`)
      .bind(entry.name)
      .all<{ name: string; type: string; not_null: number }>();
    const foreignKeys = await db
      .prepare(
        `SELECT id, seq, "table" AS parent_table, "from" AS child_column, "to" AS parent_column
         FROM pragma_foreign_key_list(?) ORDER BY id, seq`,
      )
      .bind(entry.name)
      .all<{
        id: number;
        seq: number;
        parent_table: string;
        child_column: string;
        parent_column: string;
      }>();
    const grouped = new Map<
      number,
      { columns: string[]; parentTable: string; parentColumns: string[] }
    >();
    for (const foreignKey of foreignKeys.results) {
      if (
        D1_BACKUP_TABLES.find((table) => table.name === foreignKey.parent_table)?.classification !==
        'BUSINESS'
      ) {
        continue;
      }
      const group = grouped.get(foreignKey.id) ?? {
        columns: [],
        parentTable: foreignKey.parent_table,
        parentColumns: [],
      };
      group.columns.push(foreignKey.child_column);
      group.parentColumns.push(foreignKey.parent_column);
      grouped.set(foreignKey.id, group);
    }
    tables[entry.name] = {
      columns: Object.fromEntries(
        columns.results.map((column) => [
          column.name,
          { type: column.type, notNull: column.not_null === 1 },
        ]),
      ),
      checks: parseChecks(definition?.sql ?? null),
      foreignKeys: [...grouped.values()],
    };
  }
  return { version, tables };
}

async function unwrapDek(
  kms: BackupKmsBinding,
  input: {
    readonly tenantId: string;
    readonly backupId: string;
    readonly wrappedDek: Uint8Array;
    readonly kekVersion: string;
  },
): Promise<Uint8Array> {
  try {
    if (kms.unwrapDek) return await kms.unwrapDek(input);
    if (kms.unwrap) return await kms.unwrap(input);
  } catch {
    throw codedError('BACKUP_KMS_UNAVAILABLE');
  }
  throw codedError('BACKUP_KMS_UNAVAILABLE');
}

async function readSealed(bucket: BackupBucketLike, key: string, expectedHash?: string) {
  const object = await bucket.get(key);
  if (!object) throw codedError(['BACKUP', 'R2', 'OBJECT', 'MISSING'].join('_'));
  const sealed = new Uint8Array(await object.arrayBuffer());
  if (expectedHash && (await sha256(sealed)) !== expectedHash) {
    throw codedError('BACKUP_CIPHERTEXT_TAMPERED');
  }
  return { object, sealed };
}

export async function validateReadyBackup(
  env: ValidationEnv,
  input: {
    readonly tenantId: string;
    readonly backupId: string;
    readonly collectRestoreRows?: RestoreDryRunVerificationInput['collectRestoreRows'];
  },
) {
  const backup = await env.DB.prepare(
    `SELECT manifest_r2_key, wrapped_dek, kek_version, schema_version, registry_version, global_hash
     FROM data_backups
     WHERE tenant_id = ? AND id = ? AND status = 'READY' AND deleted_at IS NULL
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
  )
    .bind(input.tenantId, input.backupId)
    .first<BackupControlRow>();
  if (!backup) throw codedError('NOT_FOUND');
  if (backup.registry_version !== D1_BACKUP_REGISTRY_VERSION) {
    throw Object.assign(codedError('BACKUP_REGISTRY_STALE'), {
      mismatch: 'registry_version',
      expected: D1_BACKUP_REGISTRY_VERSION,
      actual: backup.registry_version,
    });
  }
  const dek = await unwrapDek(env.BACKUP_KMS, {
    ...input,
    wrappedDek: new Uint8Array(backup.wrapped_dek),
    kekVersion: backup.kek_version,
  });
  const manifestStored = await readSealed(env.BACKUPS, backup.manifest_r2_key);
  const nonceHex = manifestStored.object.customMetadata?.nonce;
  if (!nonceHex || manifestStored.sealed.byteLength < 16) {
    throw codedError(['BACKUP', 'MANIFEST', 'INVALID'].join('_'));
  }
  const manifestAad = {
    tenant_id: input.tenantId,
    backup_id: input.backupId,
    format: 'KPBK1' as const,
    kind: 'MANIFEST' as const,
    ordinal: 0,
  };
  const manifestBytes = await decryptKpbk1Unit(
    {
      ciphertext: manifestStored.sealed.slice(0, -16),
      nonce: bytesFromHex(nonceHex),
      nonceHex,
      authTag: manifestStored.sealed.slice(-16),
      aad: manifestAad,
      plaintextHash: '',
    },
    dek,
    manifestAad,
  );
  const manifest = parseKpbk1Manifest(manifestBytes);
  if (manifest.tenant_id !== input.tenantId) {
    throw codedError('BACKUP_TENANT_MISMATCH');
  }
  if (manifest.backup_id !== input.backupId) {
    throw Object.assign(codedError('BACKUP_MANIFEST_MISMATCH'), {
      mismatch: 'backup_id',
    });
  }
  if (manifest.schema_version !== backup.schema_version) {
    throw Object.assign(codedError('BACKUP_MANIFEST_MISMATCH'), {
      mismatch: 'schema_version',
      expected: backup.schema_version,
      actual: manifest.schema_version,
    });
  }
  if (manifest.registry_version !== backup.registry_version) {
    throw Object.assign(codedError('BACKUP_MANIFEST_MISMATCH'), {
      mismatch: 'registry_version',
      expected: backup.registry_version,
      actual: manifest.registry_version,
    });
  }
  if (manifest.global_hash !== backup.global_hash) {
    throw Object.assign(codedError('BACKUP_MANIFEST_MISMATCH'), {
      mismatch: 'global_hash',
    });
  }

  const chunkRows = await env.DB.prepare(
    `SELECT table_name, ordinal, nonce, auth_tag, r2_key, plaintext_hash, ciphertext_hash
     FROM data_backup_chunks WHERE tenant_id = ? AND backup_id = ?
     ORDER BY table_name, ordinal`,
  )
    .bind(input.tenantId, input.backupId)
    .all<ChunkControlRow>();
  const tableUnits: EncryptedKpbk1Unit[] = [];
  const auditRows: BackupRow[] = [];
  for (const chunk of chunkRows.results) {
    const stored = await readSealed(env.BACKUPS, chunk.r2_key, chunk.ciphertext_hash);
    const aad = {
      tenant_id: input.tenantId,
      backup_id: input.backupId,
      format: 'KPBK1' as const,
      kind: 'TABLE' as const,
      ordinal: chunk.ordinal,
    };
    const authTag = new Uint8Array(chunk.auth_tag);
    const unit = {
      ciphertext: stored.sealed.slice(0, -authTag.byteLength),
      nonce: new Uint8Array(chunk.nonce),
      nonceHex: '',
      authTag,
      aad,
      plaintextHash: chunk.plaintext_hash,
    };
    tableUnits.push(unit);
    if (chunk.table_name === 'audit_events') {
      auditRows.push(...parseKpbk1Jsonl(await decryptKpbk1Unit(unit, dek, aad)));
    }
  }

  const objectRows = await env.DB.prepare(
    `SELECT ordinal, source_r2_key, backup_r2_key, nonce, auth_tag,
            plaintext_hash, ciphertext_hash
     FROM data_backup_objects WHERE tenant_id = ? AND backup_id = ? ORDER BY ordinal`,
  )
    .bind(input.tenantId, input.backupId)
    .all<ObjectControlRow>();
  const objectBytes = new Map<string, Uint8Array>();
  for (const object of objectRows.results) {
    const stored = await readSealed(env.BACKUPS, object.backup_r2_key, object.ciphertext_hash);
    const aad = {
      tenant_id: input.tenantId,
      backup_id: input.backupId,
      format: 'KPBK1' as const,
      kind: 'OBJECT' as const,
      ordinal: object.ordinal,
    };
    const authTag = new Uint8Array(object.auth_tag);
    const plaintext = await decryptKpbk1Unit(
      {
        ciphertext: stored.sealed.slice(0, -authTag.byteLength),
        nonce: new Uint8Array(object.nonce),
        nonceHex: '',
        authTag,
        aad,
        plaintextHash: object.plaintext_hash,
      },
      dek,
      aad,
    );
    if ((await sha256(plaintext)) !== object.plaintext_hash) {
      throw codedError('BACKUP_SOURCE_OBJECT_CHANGED');
    }
    objectBytes.set(object.source_r2_key, plaintext);
  }

  const reader = createBackupSnapshotReader({ db: env.DB });
  const schema = await readSchema(env.DB, backup.schema_version);
  const orderedAudit = [...auditRows].sort(
    (left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)) ||
      String(left.id).localeCompare(String(right.id)),
  );
  return verifyRestoreDryRun(
    verificationInput({
      ...input,
      dek,
      manifest,
      schema,
      registry: domainRegistry(),
      tableUnits,
      orderedAudit,
      paginatedCurrentRows: (table, after) =>
        reader.readTablePage({
          tenantId: input.tenantId,
          tableName: table,
          after,
          limit: 500,
        }),
      readReferencedObject: (key) => Promise.resolve(objectBytes.get(key) ?? null),
    }),
  );
}

function verificationInput(input: {
  readonly tenantId: string;
  readonly backupId: string;
  readonly dek: Uint8Array;
  readonly manifest: ReturnType<typeof parseKpbk1Manifest>;
  readonly schema: RestoreDryRunVerificationInput['schema'];
  readonly registry: BackupRegistry;
  readonly tableUnits: readonly EncryptedKpbk1Unit[];
  readonly orderedAudit: readonly BackupRow[];
  readonly paginatedCurrentRows: (
    table: string,
    after: Readonly<Record<string, unknown>> | null,
  ) => Promise<{ rows: readonly BackupRow[]; next: Record<string, unknown> | null }>;
  readonly readReferencedObject: (key: string) => Promise<Uint8Array | null>;
  readonly collectRestoreRows?: RestoreDryRunVerificationInput['collectRestoreRows'];
}): RestoreDryRunVerificationInput {
  return {
    expectedTenantId: input.tenantId,
    expectedBackupId: input.backupId,
    supportedSchemaVersions: ['0035'],
    registry: input.registry,
    schema: input.schema,
    manifest: input.manifest,
    dek: input.dek,
    tableUnits: input.tableUnits,
    readCurrentRows: async function* (table) {
      let after: Readonly<Record<string, unknown>> | null = null;
      do {
        const page = await input.paginatedCurrentRows(table, after);
        yield* page.rows;
        after = page.next;
      } while (after);
    },
    readReferencedObject: input.readReferencedObject,
    readAuditRows: async function* () {
      await Promise.resolve();
      for (const row of input.orderedAudit) {
        const prevHash =
          typeof row.prev_hash === 'string' && row.prev_hash !== '' ? row.prev_hash : null;
        const rowHash = typeof row.row_hash === 'string' ? row.row_hash : '';
        // Solo formato aquí: la estructura de la cadena (génesis + enlaces
        // prev→row, independiente del orden de filas) la valida íntegramente
        // verifyRestoreAuditChain en el motor.
        if (!/^[0-9a-f]{64}$/.test(rowHash)) {
          throw codedError('BACKUP_AUDIT_CHAIN_INVALID');
        }
        yield { id: String(row.id), prevHash, rowHash };
      }
    },
    maxDifferencesPerTable: 100,
    ...(input.collectRestoreRows ? { collectRestoreRows: input.collectRestoreRows } : {}),
  };
}

export function safeRestoreValidationError(cause: unknown): {
  readonly code: string;
  readonly errorRef: string;
} {
  const manifestInvalid = ['BACKUP', 'MANIFEST', 'INVALID'].join('_');
  const r2Missing = ['BACKUP', 'R2', 'OBJECT', 'MISSING'].join('_');
  const allowlisted = new Set([
    'NOT_FOUND',
    'BACKUP_KMS_UNAVAILABLE',
    manifestInvalid,
    'BACKUP_CHUNK_TAMPERED',
    'BACKUP_CIPHERTEXT_TAMPERED',
    'BACKUP_SCHEMA_UNSUPPORTED',
    'BACKUP_TENANT_MISMATCH',
    'BACKUP_FK_FAILED',
    'BACKUP_CHECK_FAILED',
    'BACKUP_AUDIT_CHAIN_INVALID',
    r2Missing,
    'BACKUP_SOURCE_OBJECT_CHANGED',
  ]);
  const code =
    cause instanceof Error && allowlisted.has(cause.message)
      ? cause.message
      : 'RESTORE_VERIFY_FAILED';
  return { code, errorRef: crypto.randomUUID() };
}
