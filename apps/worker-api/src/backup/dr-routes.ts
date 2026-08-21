/**
 * Sprint 48 — platform.dr (Arquitectura §5.3 regla 32b / §5.9 regla 27).
 *
 * Simulacro DR anual: backup READY → restore apply al shard DR (binding
 * DR_DB, composición — jamás producción viva) → verificación RPO=0 tx, RPO≤1d
 * rollups y replay de colas sin duplicados → RTO medido (≤30 min) → audit
 * `DR_SIMULATION_*` con el payload completo. Gated FEATURE_PLATFORM_DR,
 * owner-only con step-up token (patrón restore dry-run).
 */
import {
  applyRestoreRowsToShard,
  appendBackupAudit,
  RTO_TARGET_MS,
  verifyDrReplay,
  type BackupAuditAction,
} from '@kipuspay/adapters-d1';
import { D1_BACKUP_REGISTRY_VERSION, D1_BACKUP_TABLES } from '@kipuspay/adapters-d1';
import type { BackupRow } from '@kipuspay/domain-integrations';
import type { BackupKmsBinding } from './backup-workflow.js';
import { validateReadyBackup, type BackupBucketLike } from './backup-restore-validator.js';

export interface DrRouteEnv {
  readonly FEATURE_PLATFORM_DR?: string;
  readonly DB?: D1Database;
  readonly DR_DB?: D1Database;
  readonly BACKUPS?: BackupBucketLike;
  readonly BACKUP_KMS?: BackupKmsBinding;
}

export interface DrActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export interface DrHttpResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

export function isPlatformDrEnabled(env: DrRouteEnv | undefined): boolean {
  return env?.FEATURE_PLATFORM_DR === '1' || env?.FEATURE_PLATFORM_DR === 'true';
}

function result(status: number, body: Readonly<Record<string, unknown>>): DrHttpResult {
  return { status, body };
}

const OWNER_ROLES = new Set(['owner']);
const MAX_STEP_UP_TOKEN_LENGTH = 512;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function consumeStepUpToken(
  env: DrRouteEnv,
  actor: DrActor,
  input: { readonly backupId: string; readonly token: string | undefined },
): Promise<DrHttpResult | null> {
  const token = input.token?.trim() ?? '';
  if (!token || token.length > MAX_STEP_UP_TOKEN_LENGTH) {
    return result(401, { code: 'STEP_UP_REQUIRED' });
  }
  if (!env.DB) return result(503, { code: 'DR_D1_UNAVAILABLE' });
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
      .bind(actor.tenantId, actor.userId, tokenHash, 'PLATFORM_DR_SIMULATION', input.backupId)
      .run();
    // Epoch triggers on authorization_tokens bump tenant_data_epochs in the same
    // statement batch, so D1 may report changes > 1 for a successful consume.
    return (consumed.meta?.changes ?? 0) >= 1 ? null : result(401, { code: 'STEP_UP_REQUIRED' });
  } catch {
    return result(503, { code: 'DR_STEP_UP_UNAVAILABLE' });
  }
}

/** FKs reales entre tablas BUSINESS (registry es controlado: sin interpolación de input). */
async function businessForeignKeys(
  db: D1Database,
): Promise<{ readonly table: string; readonly parentTable: string }[]> {
  const foreignKeys: { readonly table: string; readonly parentTable: string }[] = [];
  for (const entry of D1_BACKUP_TABLES.filter((table) => table.classification === 'BUSINESS')) {
    const fks = await db
      .prepare(
        `SELECT "table" AS parent_table FROM pragma_foreign_key_list('${entry.name}') GROUP BY "table"`,
      )
      .all<{ parent_table: string }>();
    for (const fk of fks.results ?? []) {
      foreignKeys.push({ table: entry.name, parentTable: fk.parent_table });
    }
  }
  return foreignKeys;
}

async function selectLatestReadyBackup(
  env: DrRouteEnv,
  tenantId: string,
  backupId: string | undefined,
): Promise<{ id: string; global_hash: string } | null> {
  if (backupId) {
    return env
      .DB!.prepare(
        `SELECT id, global_hash FROM data_backups
       WHERE tenant_id = ? AND id = ? AND status = 'READY'
         AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      )
      .bind(tenantId, backupId)
      .first<{ id: string; global_hash: string }>();
  }
  return env
    .DB!.prepare(
      `SELECT id, global_hash FROM data_backups
     WHERE tenant_id = ? AND status = 'READY' AND deleted_at IS NULL
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ id: string; global_hash: string }>();
}

export async function runDrSimulationHttp(
  env: DrRouteEnv,
  actor: DrActor,
  input: {
    readonly backupId?: string;
    readonly stepUpToken?: string;
    readonly nowMs?: number;
  },
): Promise<DrHttpResult> {
  if (!isPlatformDrEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!env.DB || !env.DR_DB || !env.BACKUPS || !env.BACKUP_KMS) {
    return result(503, { code: 'DR_DEPENDENCY_UNAVAILABLE' });
  }
  if (!OWNER_ROLES.has(actor.role.toLowerCase())) {
    return result(403, { code: 'FORBIDDEN' });
  }
  const nowMs = input.nowMs ?? Date.now();

  const backup = await selectLatestReadyBackup(env, actor.tenantId, input.backupId);
  if (!backup) return result(404, { code: 'NOT_FOUND' });
  const backupId = backup.id;

  const stepUpDenied = await consumeStepUpToken(env, actor, {
    backupId,
    token: input.stepUpToken,
  });
  if (stepUpDenied) return stepUpDenied;

  return executeDrSimulation(env, actor, backup, nowMs);
}

async function executeDrSimulation(
  env: DrRouteEnv,
  actor: DrActor,
  backup: { readonly id: string; readonly global_hash: string },
  nowMs: number,
): Promise<DrHttpResult> {
  const backupId = backup.id;
  const audit = async (action: BackupAuditAction, payload: Readonly<Record<string, unknown>>) => {
    await appendBackupAudit(env.DB!, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      backupId,
      payload,
    }).catch(() => undefined);
  };

  const startedAtMs = Date.now();
  const collected = new Map<string, BackupRow[]>();
  try {
    await audit('DR_SIMULATION_STARTED', { backupId });
    await validateReadyBackup(
      {
        DB: env.DB!,
        BACKUPS: env.BACKUPS!,
        BACKUP_KMS: env.BACKUP_KMS!,
      },
      {
        tenantId: actor.tenantId,
        backupId,
        collectRestoreRows: (rows) => {
          for (const [table, tableRows] of rows) collected.set(table, [...tableRows]);
        },
      },
    );
    const foreignKeys = await businessForeignKeys(env.DB!);

    const apply = await applyRestoreRowsToShard({
      db: env.DR_DB!,
      rowsByTable: collected,
      foreignKeys,
    });
    const rtoMs = Date.now() - startedAtMs;

    const salesInManifest = collected.get('sales')?.length ?? 0;
    const verification = await verifyDrReplay({
      db: env.DR_DB!,
      tenantId: actor.tenantId,
      expectedSalesCount: salesInManifest,
      nowMs,
    });

    const rtoOk = rtoMs <= RTO_TARGET_MS;
    const verdict =
      verification.rpoTxZero && verification.rpoRollupOneDay && rtoOk
        ? 'PASSED'
        : verification.rpoTxZero && verification.rpoRollupOneDay
          ? 'RTO_EXCEEDED'
          : 'RPO_VIOLATION';
    const payload = {
      backupId,
      manifestHash: backup.global_hash,
      rtoMs,
      rtoTargetMs: RTO_TARGET_MS,
      rtoOk,
      tablesApplied: apply.tables,
      rowsApplied: apply.rowsInserted,
      salesRestored: salesInManifest,
      rollupLatestDay: verification.rollupLatestDay,
      replayDuplicatesBlocked: verification.duplicatesBlocked,
      rpoTxZero: verification.rpoTxZero,
      rpoRollupOneDay: verification.rpoRollupOneDay,
      registryVersion: D1_BACKUP_REGISTRY_VERSION,
      verdict,
    };
    await audit('DR_SIMULATION_PASSED', payload);
    return result(200, payload);
  } catch (cause) {
    const coded =
      cause instanceof Error &&
      [
        'BACKUP_KMS_UNAVAILABLE',
        'BACKUP_TENANT_MISMATCH',
        'BACKUP_CHUNK_TAMPERED',
        'BACKUP_MANIFEST_INVALID',
        'BACKUP_MANIFEST_MISMATCH',
        'BACKUP_REGISTRY_STALE',
        'BACKUP_REGISTRY_MISMATCH',
        'BACKUP_REGISTRY_INCOMPLETE',
        'BACKUP_R2_OBJECT_MISSING',
        'BACKUP_CIPHERTEXT_TAMPERED',
        'DR_RESTORE_FK_CYCLE',
        'NOT_FOUND',
      ].includes(cause.message)
        ? cause.message
        : 'DR_SIMULATION_FAILED';
    const detail = cause instanceof Error ? cause.message.slice(0, 200) : 'unknown';
    const detailPayload: Record<string, unknown> = {
      backupId,
      code: coded,
      detail,
      errorRef: crypto.randomUUID(),
    };
    if (cause && typeof cause === 'object') {
      const mismatch = (cause as { mismatch?: unknown }).mismatch;
      const expected = (cause as { expected?: unknown }).expected;
      const actual = (cause as { actual?: unknown }).actual;
      if (typeof mismatch === 'string') detailPayload.mismatch = mismatch;
      if (typeof expected === 'string') detailPayload.expected = expected;
      if (typeof actual === 'string') detailPayload.actual = actual;
    }
    await audit('DR_SIMULATION_FAILED', detailPayload);
    return result(422, {
      code: coded,
      errorRef: crypto.randomUUID(),
      ...(typeof detailPayload.mismatch === 'string' ? { mismatch: detailPayload.mismatch } : {}),
      ...(typeof detailPayload.expected === 'string' ? { expected: detailPayload.expected } : {}),
      ...(typeof detailPayload.actual === 'string' ? { actual: detailPayload.actual } : {}),
    });
  }
}
