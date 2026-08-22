import type { BackupKmsBinding } from './backup-workflow.js';
import {
  appendBackupAudit,
  runRestoreDryRunAudited,
  D1_BACKUP_REGISTRY_VERSION,
} from '@kipuspay/adapters-d1';
import { decryptKpbk1Unit } from '@kipuspay/domain-integrations';
import { safeBackupErrorCode } from './backup-errors.js';
import { safeRestoreValidationError, validateReadyBackup } from './backup-restore-validator.js';

export interface BackupActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly permissions?: readonly string[];
}

interface BackupBound {
  bind(...values: unknown[]): BackupBound;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ readonly results: readonly T[] }>;
  run(): Promise<{ readonly meta?: { readonly changes?: number } }>;
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
const MAX_IDEMPOTENCY_LENGTH = 128;
const MAX_STEP_UP_TOKEN_LENGTH = 512;

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

function safeBackupRow(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const code =
    typeof row.error_code === 'string' ? safeBackupErrorCode({ code: row.error_code }) : null;
  const reference =
    typeof row.error_ref === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.error_ref)
      ? row.error_ref
      : null;
  return { ...row, error_code: code, error_ref: reference };
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

function ownerPermission(actor: BackupActor, permission: string): BackupHttpResult | null {
  if (actor.role.toLowerCase() !== 'owner') return result(403, { code: 'FORBIDDEN' });
  if (!actor.permissions?.includes(permission)) {
    return result(403, { code: 'FORBIDDEN' });
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function plaintextHashMatches(plaintext: Uint8Array, expectedHex: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const actual = new Uint8Array(
    await crypto.subtle.digest('SHA-256', Uint8Array.from(plaintext).buffer),
  );
  const expected = Uint8Array.from(expectedHex.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBufferView, right: ArrayBufferView) => boolean;
  };
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(actual, expected);
  let difference = actual.byteLength ^ expected.byteLength;
  for (let index = 0; index < actual.byteLength; index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

async function consumeStepUpToken(
  env: BackupRouteEnv,
  actor: BackupActor,
  input: { readonly backupId: string; readonly action: string; readonly token: string | undefined },
): Promise<BackupHttpResult | null> {
  const token = input.token?.trim() ?? '';
  if (!token || token.length > MAX_STEP_UP_TOKEN_LENGTH) {
    return result(401, { code: 'STEP_UP_REQUIRED' });
  }
  if (!env.DB) {
    return result(503, { code: 'BACKUP_D1_UNAVAILABLE', errorRef: errorRef() });
  }
  const tokenHash = await sha256Hex(token);
  try {
    const consumed = await env.DB.prepare(
      `UPDATE authorization_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND actor_user_id = ? AND token_hash = ?
         AND action = ? AND backup_id = ? AND used_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
         AND created_at >= datetime('now', '-5 minutes')`,
    )
      .bind(actor.tenantId, actor.userId, tokenHash, input.action, input.backupId)
      .run();
    // Epoch triggers on authorization_tokens bump tenant_data_epochs; D1 may
    // report changes > 1 for a successful one-shot consume.
    return (consumed.meta?.changes ?? 0) >= 1 ? null : result(401, { code: 'STEP_UP_REQUIRED' });
  } catch {
    return result(503, { code: 'BACKUP_STEP_UP_UNAVAILABLE', errorRef: errorRef() });
  }
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
  // S42-H2: fail-closed (invariante 5) — jamás 202 sin persistir.
  if (!env.DB) return result(503, { code: 'BACKUP_D1_UNAVAILABLE', errorRef: errorRef() });
  {
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
         ) VALUES (?, ?, ?, 'KPBK1', ?, '0035', 0, 'PENDING', ?,
                   datetime('now', '+7 days'))`,
    )
      .bind(backupId, actor.tenantId, key, D1_BACKUP_REGISTRY_VERSION, actor.userId)
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
  // S42-H2: fail-closed — sin DB jamás un 200 vacío (invariante 5).
  if (!env.DB) return result(503, { code: 'BACKUP_D1_UNAVAILABLE', errorRef: errorRef() });
  const rows = await env.DB.prepare(
    `SELECT id, status, created_at, ready_at, expires_at, format_version,
              registry_version, schema_version, kek_version, plaintext_size_bytes,
              ciphertext_size_bytes, chunk_count, object_count, global_hash, error_code, error_ref
       FROM data_backups WHERE tenant_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 100`,
  )
    .bind(actor.tenantId)
    .all<Record<string, unknown>>();
  return result(200, { items: rows.results.map(safeBackupRow) });
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
  return row ? result(200, safeBackupRow(row)) : result(404, { code: 'NOT_FOUND' });
}

// Security checks intentionally remain linear so every fail-closed exit is visible.
// eslint-disable-next-line complexity
export async function runDownloadBackupHttp(
  env: BackupRouteEnv,
  actor: BackupActor,
  input: { readonly backupId: string; readonly stepUpToken?: string },
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, new Set(['owner']));
  if (denied) return denied;
  const permissionDenied = ownerPermission(actor, 'data.backup.download');
  if (permissionDenied) return permissionDenied;
  if (!env.DB) return result(503, { code: 'BACKUP_D1_UNAVAILABLE', errorRef: errorRef() });
  let stream: ReadableStream<Uint8Array>;
  {
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
    const stepUpDenied = await consumeStepUpToken(env, actor, {
      backupId: input.backupId,
      action: 'DATA_BACKUP_DOWNLOAD',
      token: input.stepUpToken,
    });
    if (stepUpDenied) return stepUpDenied;
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
    stream = new ReadableStream<Uint8Array>({
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
        if (!(await plaintextHashMatches(plaintext, unit.plaintext_hash))) {
          controller.error(new Error('BACKUP_CHUNK_TAMPERED'));
          return;
        }
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
  input: {
    readonly backupId: string;
    readonly idempotencyKey: string;
    readonly stepUpToken?: string;
  },
  schedule?: (task: Promise<void>) => void,
): Promise<BackupHttpResult> {
  const denied = await preflight(env, actor, new Set(['owner']));
  if (denied) return denied;
  const permissionDenied = ownerPermission(actor, 'data.backup.restore_dry_run');
  if (permissionDenied) return permissionDenied;
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
  const stepUpDenied = await consumeStepUpToken(env, actor, {
    backupId: input.backupId,
    action: 'DATA_BACKUP_RESTORE_DRY_RUN',
    token: input.stepUpToken,
  });
  if (stepUpDenied) return stepUpDenied;
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

/**
 * S42-H1: emite el step-up token de backup (SEC-09 / QG s42).
 * El consume existía (x-step-up-token) pero ningún endpoint lo emitía —
 * download/restore-dry-run/DR devolvían 401 en producción. Owner + permiso
 * + token one-shot TTL 90s con scope DATA_BACKUP_DOWNLOAD | PLATFORM_DR_SIMULATION.
 */
export async function runMintBackupStepUpTokenHttp(
  env: BackupRouteEnv | undefined,
  actor: BackupActor,
  body: Readonly<Record<string, unknown>>,
): Promise<BackupHttpResult> {
  if (!env?.DB) return result(503, { error: 'Database unavailable', code: 'DB_UNAVAILABLE' });
  if (!actor?.tenantId || !actor.userId) {
    return result(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  if (actor.role.toLowerCase() !== 'owner') {
    return result(403, { code: 'FORBIDDEN' });
  }
  if (!actor.permissions?.includes('data.backup.download')) {
    return result(403, { code: 'FORBIDDEN' });
  }
  const backupId = typeof body.backupId === 'string' ? body.backupId : '';
  const rawAction = typeof body.action === 'string' ? body.action : 'DATA_BACKUP_DOWNLOAD';
  const action =
    rawAction === 'PLATFORM_DR_SIMULATION'
      ? 'PLATFORM_DR_SIMULATION'
      : rawAction === 'DATA_BACKUP_RESTORE_DRY_RUN'
        ? 'DATA_BACKUP_RESTORE_DRY_RUN'
        : 'DATA_BACKUP_DOWNLOAD';
  if (!backupId) {
    return result(400, { error: 'backupId required', code: 'BAD_REQUEST' });
  }
  const row = await env.DB.prepare(
    `SELECT id FROM data_backups WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(actor.tenantId, backupId)
    .first<{ id: string }>();
  if (!row) return result(404, { error: 'Not found', code: 'BACKUP_NOT_FOUND' });

  const token = `backup_${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO authorization_tokens (
       id, tenant_id, token_hash, approved_by_user_id, expires_at, backup_id,
       action, actor_user_id
     ) VALUES (?, ?, ?, ?, datetime('now', '+90 seconds'), ?, ?, ?)`,
  )
    .bind(id, actor.tenantId, tokenHash, actor.userId, backupId, action, actor.userId)
    .run();

  return result(200, {
    token,
    action,
    backupId,
    expiresInSeconds: 90,
    oneShot: true,
  });
}
