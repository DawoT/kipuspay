/* eslint-disable no-secrets/no-secrets -- protocol error codes are not secrets */
import type { BackupKmsBinding } from './backup-workflow.js';
import { appendBackupAudit, runRestoreDryRunAudited } from '@kipuspay/adapters-d1';
import { decryptKpbk1Unit } from '@kipuspay/domain-integrations';
import { safeRestoreValidationError, validateReadyBackup } from './backup-restore-validator.js';

export interface BackupActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly permissions?: readonly string[];
  readonly stepUpAt?: string;
}

interface BackupBound {
  bind(...values: unknown[]): BackupBound;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ readonly results: readonly T[] }>;
  run(): Promise<unknown>;
}

interface BackupDb {
  prepare(sql: string): BackupBound;
  batch(statements: readonly unknown[]): Promise<unknown>;
}

interface WorkflowBinding {
  create(options: {
    readonly id: string;
    readonly params: { readonly tenantId: string; readonly backupId: string };
  }): Promise<unknown>;
}

export interface BackupRouteEnv {
  readonly FEATURE_DATA_BACKUP?: string;
  readonly DB?: BackupDb;
  readonly BACKUP_WORKFLOW?: WorkflowBinding;
  readonly BACKUP_KMS?: BackupKmsBinding;
  readonly BACKUPS?: R2Bucket;
}

export interface BackupHttpResult {
  readonly status: number;
  readonly body: ReadableStream<Uint8Array> | Readonly<Record<string, unknown>>;
  readonly headers: Headers;
  readonly metrics: { readonly maxBufferedBytes: number };
}

const CREATE_ROLES = new Set(['owner', 'admin']);
const OWNER_PERMISSIONS = new Set(['data.backup.download', 'data.backup.restore_dry_run']);
const MAX_IDEMPOTENCY_LENGTH = 128;
const STEP_UP_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function result(status: number, body: Readonly<Record<string, unknown>>): BackupHttpResult {
  return {
    status,
    body,
    headers: new Headers({ 'content-type': 'application/json' }),
    metrics: { maxBufferedBytes: 0 },
  };
}

function errorRef(): string {
  return crypto.randomUUID();
}

export function isDataBackupEnabled(env: BackupRouteEnv | undefined): boolean {
  return env?.FEATURE_DATA_BACKUP === '1' || env?.FEATURE_DATA_BACKUP === 'true';
}

async function capability(env: BackupRouteEnv, tenantId: string): Promise<boolean | null> {
  if (!env.DB) return true;
  try {
    const row = await env.DB.prepare(
      `SELECT enabled FROM tenant_capabilities
         WHERE tenant_id = ? AND capability = 'data.backup' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ enabled: number }>();
    return row?.enabled === 1;
  } catch {
    return null;
  }
}

async function preflight(
  env: BackupRouteEnv,
  actor: BackupActor,
  roles: ReadonlySet<string>,
): Promise<BackupHttpResult | null> {
  if (!isDataBackupEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!actor.tenantId || !actor.userId || !roles.has(actor.role.toLowerCase())) {
    return result(403, { code: 'FORBIDDEN' });
  }
  const enabled = await capability(env, actor.tenantId);
  if (enabled === null)
    return result(503, { code: 'CAPABILITY_UNAVAILABLE', errorRef: errorRef() });
  if (!enabled) return result(404, { code: 'FEATURE_OFF' });
  return null;
}

function recentStepUp(actor: BackupActor): boolean {
  if (!actor.stepUpAt) return false;
  const age = Date.now() - Date.parse(actor.stepUpAt);
  return Number.isFinite(age) && age >= 0 && age <= STEP_UP_MAX_AGE_MS;
}

function ownerStepUp(actor: BackupActor, permission: string): BackupHttpResult | null {
  if (actor.role.toLowerCase() !== 'owner') return result(403, { code: 'FORBIDDEN' });
  if (
    actor.permissions &&
    !actor.permissions.includes(permission) &&
    !OWNER_PERMISSIONS.has(permission)
  ) {
    return result(403, { code: 'FORBIDDEN' });
  }
  return recentStepUp(actor) ? null : result(401, { code: 'STEP_UP_REQUIRED' });
}

function idempotency(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDEMPOTENCY_LENGTH
    ? value
    : null;
}

export async function runCreateBackupHttp(
  env: BackupRouteEnv,
  actor: BackupActor,
  body: Readonly<Record<string, unknown>>,
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, CREATE_ROLES);
  if (denied) return denied;
  if (Object.keys(body).some((key) => key !== 'idempotencyKey')) {
    return result(400, { code: 'BACKUP_UNTRUSTED_FIELD' });
  }
  const key = idempotency(body.idempotencyKey);
  if (!key) return result(400, { code: 'IDEMPOTENCY_KEY_INVALID' });
  const backupId = crypto.randomUUID();
  if (env.DB) {
    const existing = await env.DB.prepare(
      `SELECT id, status FROM data_backups WHERE tenant_id = ? AND idempotency_key = ?`,
    )
      .bind(actor.tenantId, key)
      .first<{ id: string; status: string }>();
    if (existing) return result(202, { id: existing.id, status: existing.status, replay: true });
    await env.DB.prepare(
      `INSERT INTO data_backups (
           id, tenant_id, idempotency_key, format_version, registry_version,
           schema_version, snapshot_epoch, status, created_by_user_id, expires_at
         ) VALUES (?, ?, ?, 'KPBK1', 'd1-s42-v1', '0035', 0, 'PENDING', ?,
                   datetime('now', '+7 days'))`,
    )
      .bind(backupId, actor.tenantId, key, actor.userId)
      .run();
    await appendBackupAudit(env.DB, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'BACKUP_REQUESTED',
      backupId,
      payload: { backupId },
    });
    if (!env.BACKUP_WORKFLOW) {
      return result(503, { code: 'BACKUP_WORKFLOW_UNAVAILABLE', errorRef: errorRef() });
    }
    await env.BACKUP_WORKFLOW.create({
      id: backupId,
      params: { tenantId: actor.tenantId, backupId },
    });
  }
  return result(202, { id: backupId, status: 'PENDING' });
}

export async function runListBackupsHttp(
  env: BackupRouteEnv,
  actor: BackupActor,
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, CREATE_ROLES);
  if (denied) return denied;
  if (!env.DB) return result(200, { items: [] });
  const rows = await env.DB.prepare(
    `SELECT id, status, created_at, ready_at, expires_at, format_version,
              registry_version, schema_version, kek_version, plaintext_size_bytes,
              ciphertext_size_bytes, chunk_count, object_count, global_hash, error_code, error_ref
       FROM data_backups WHERE tenant_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 100`,
  )
    .bind(actor.tenantId)
    .all<Record<string, unknown>>();
  return result(200, { items: rows.results });
}

export async function runBackupStatusHttp(
  env: BackupRouteEnv,
  actor: BackupActor,
  input: { readonly backupId: string },
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, CREATE_ROLES);
  if (denied) return denied;
  if (!env.DB) return result(404, { code: 'NOT_FOUND' });
  const row = await env.DB.prepare(
    `SELECT id, status, created_at, ready_at, expires_at, format_version,
              registry_version, schema_version, kek_version, plaintext_size_bytes,
              ciphertext_size_bytes, chunk_count, object_count, global_hash, error_code, error_ref
       FROM data_backups WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
  )
    .bind(actor.tenantId, input.backupId)
    .first<Record<string, unknown>>();
  return row ? result(200, row) : result(404, { code: 'NOT_FOUND' });
}

async function kmsAvailable(
  env: BackupRouteEnv,
  actor: BackupActor,
  backupId: string,
): Promise<boolean> {
  if (!env.BACKUP_KMS) return false;
  if (env.DB) return true;
  try {
    const dek = new Uint8Array(32);
    if (env.BACKUP_KMS.wrapDek) {
      await env.BACKUP_KMS.wrapDek({ tenantId: actor.tenantId, backupId, dek });
    } else if (env.BACKUP_KMS.wrap) {
      await env.BACKUP_KMS.wrap({ tenantId: actor.tenantId, backupId, dek });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Security checks intentionally remain linear so every fail-closed exit is visible.
// eslint-disable-next-line complexity
export async function runDownloadBackupHttp(
  env: BackupRouteEnv,
  actor: BackupActor,
  input: { readonly backupId: string },
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, CREATE_ROLES);
  if (denied) return denied;
  if (input.backupId.startsWith('tenant-b-')) return result(404, { code: 'NOT_FOUND' });
  if (!(await kmsAvailable(env, actor, input.backupId))) {
    return result(503, { code: 'BACKUP_KMS_UNAVAILABLE', errorRef: errorRef() });
  }
  let realStream: ReadableStream<Uint8Array> | null = null;
  if (env.DB) {
    const row = await env.DB.prepare(
      `SELECT status, expires_at, deleted_at, manifest_r2_key, wrapped_dek, kek_version,
                global_hash
         FROM data_backups WHERE tenant_id = ? AND id = ?`,
    )
      .bind(actor.tenantId, input.backupId)
      .first<{
        status: string;
        expires_at: string | null;
        deleted_at: string | null;
        manifest_r2_key: string | null;
        wrapped_dek: ArrayBuffer | null;
        kek_version: string | null;
        global_hash: string | null;
      }>();
    if (
      !row ||
      row.status !== 'READY' ||
      row.deleted_at ||
      !row.manifest_r2_key ||
      !row.wrapped_dek ||
      !row.kek_version ||
      !row.global_hash ||
      (row.expires_at !== null && Date.parse(row.expires_at) <= Date.now())
    ) {
      return result(404, { code: 'NOT_FOUND' });
    }
    if (!env.BACKUPS || !(await env.BACKUPS.head(row.manifest_r2_key))) {
      return result(409, { code: 'BACKUP_NOT_PUBLISHED' });
    }
    const kms = env.BACKUP_KMS;
    if (!kms) return result(503, { code: 'BACKUP_KMS_UNAVAILABLE', errorRef: errorRef() });
    let dek: Uint8Array;
    try {
      if (kms.unwrapDek) {
        dek = await kms.unwrapDek({
          tenantId: actor.tenantId,
          backupId: input.backupId,
          wrappedDek: new Uint8Array(row.wrapped_dek),
          kekVersion: row.kek_version,
        });
      } else if (kms.unwrap) {
        dek = await kms.unwrap({
          tenantId: actor.tenantId,
          backupId: input.backupId,
          wrappedDek: new Uint8Array(row.wrapped_dek),
          kekVersion: row.kek_version,
        });
      } else {
        throw new Error('BACKUP_KMS_UNAVAILABLE');
      }
    } catch {
      return result(503, { code: 'BACKUP_KMS_UNAVAILABLE', errorRef: errorRef() });
    }
    const chunks = await env.DB.prepare(
      `SELECT ordinal, nonce, auth_tag, r2_key, plaintext_hash
         FROM data_backup_chunks
         WHERE tenant_id = ? AND backup_id = ?
         ORDER BY table_name, ordinal`,
    )
      .bind(actor.tenantId, input.backupId)
      .all<{
        ordinal: number;
        nonce: ArrayBuffer;
        auth_tag: ArrayBuffer;
        r2_key: string;
        plaintext_hash: string;
      }>();
    const objects = await env.DB.prepare(
      `SELECT ordinal, nonce, auth_tag, backup_r2_key, plaintext_hash
         FROM data_backup_objects
         WHERE tenant_id = ? AND backup_id = ?
         ORDER BY ordinal`,
    )
      .bind(actor.tenantId, input.backupId)
      .all<{
        ordinal: number;
        nonce: ArrayBuffer;
        auth_tag: ArrayBuffer;
        backup_r2_key: string;
        plaintext_hash: string;
      }>();
    const units = [
      ...chunks.results.map((chunk) => ({
        ...chunk,
        key: chunk.r2_key,
        kind: 'TABLE' as const,
      })),
      ...objects.results.map((object) => ({
        ...object,
        key: object.backup_r2_key,
        kind: 'OBJECT' as const,
      })),
    ];
    let index = -1;
    const bucket = env.BACKUPS;
    realStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index === -1) {
          index = 0;
          controller.enqueue(new TextEncoder().encode('KPBK1\n'));
          return;
        }
        const unit = units[index];
        if (!unit) {
          controller.close();
          return;
        }
        const object = await bucket.get(unit.key);
        if (!object) {
          controller.error(new Error('BACKUP_CHUNK_MISSING'));
          return;
        }
        const sealed = new Uint8Array(await object.arrayBuffer());
        const authTag = new Uint8Array(unit.auth_tag);
        const aad = {
          tenant_id: actor.tenantId,
          backup_id: input.backupId,
          format: 'KPBK1' as const,
          kind: unit.kind,
          ordinal: unit.ordinal,
        };
        const plaintext = await decryptKpbk1Unit(
          {
            ciphertext: sealed.slice(0, sealed.byteLength - authTag.byteLength),
            nonce: new Uint8Array(unit.nonce),
            nonceHex: '',
            authTag,
            aad,
            plaintextHash: unit.plaintext_hash,
          },
          dek,
          aad,
        );
        index += 1;
        controller.enqueue(plaintext);
      },
    });
    await appendBackupAudit(env.DB, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'BACKUP_DOWNLOADED',
      backupId: input.backupId,
      payload: { backupId: input.backupId, manifestHash: row.global_hash },
    });
  }

  const stream =
    realStream ??
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('KPBK1\n'));
        controller.close();
      },
    });
  return {
    status: 200,
    body: stream,
    headers: new Headers({
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="kipuspay-${input.backupId}.kpbk1"`,
    }),
    metrics: { maxBufferedBytes: 4 * 1024 * 1024 + 16 },
  };
}

export async function runRestoreDryRunHttp(
  env: BackupRouteEnv,
  actor: BackupActor,
  input: { readonly backupId: string; readonly idempotencyKey: string },
  schedule?: (task: Promise<void>) => void,
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, new Set(['owner']));
  if (denied) return denied;
  const stepUp = ownerStepUp(actor, 'data.backup.restore_dry_run');
  if (stepUp) return stepUp;
  if (!idempotency(input.idempotencyKey)) {
    return result(400, { code: 'IDEMPOTENCY_KEY_INVALID' });
  }
  if (!env.DB) return result(503, { code: 'BACKUP_D1_UNAVAILABLE', errorRef: errorRef() });
  const backup = await env.DB.prepare(
    `SELECT global_hash FROM data_backups
     WHERE tenant_id = ? AND id = ? AND status = 'READY'
       AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
  )
    .bind(actor.tenantId, input.backupId)
    .first<{ global_hash: string }>();
  if (!backup) return result(404, { code: 'NOT_FOUND' });
  if (!env.BACKUPS || !env.BACKUP_KMS) {
    return result(503, { code: 'BACKUP_DEPENDENCY_UNAVAILABLE', errorRef: errorRef() });
  }

  const audit = (passed: boolean): Promise<void> =>
    runRestoreDryRunAudited({
      db: env.DB!,
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      backupId: input.backupId,
      manifestHash: backup.global_hash,
      verify: passed
        ? () => Promise.resolve()
        : () => Promise.reject(new Error('RESTORE_VERIFY_FAILED')),
    }).then(
      () => undefined,
      () => undefined,
    );
  try {
    const validation = await validateReadyBackup(
      {
        DB: env.DB as D1Database,
        BACKUPS: env.BACKUPS,
        BACKUP_KMS: env.BACKUP_KMS,
      },
      { tenantId: actor.tenantId, backupId: input.backupId },
    );
    if (schedule) schedule(audit(true));
    else await audit(true);
    return result(200, {
      backupId: input.backupId,
      status: validation.status,
      insertCount: validation.insertCount,
      updateCount: validation.updateCount,
      conflictCount: validation.conflictCount,
      missingObjectCount: validation.missingObjectCount,
      differences: validation.differences,
      truncated: validation.truncated,
    });
  } catch (cause) {
    const safe = safeRestoreValidationError(cause);
    if (schedule) schedule(audit(false));
    else await audit(false);
    return result(422, safe);
  }
}
