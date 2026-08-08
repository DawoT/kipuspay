import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from 'cloudflare:workers';
import { appendBackupAudit } from '@kipuspay/adapters-d1';
import {
  cleanupBackupAttempt,
  executeBackupAttempt,
  finalizeBackupReady,
  publishBackupManifest,
  type BackupWorkflowParams,
  type BackupWorkflowPhaseEnv as WorkflowEnv,
} from './backup-workflow-phases.js';

const RETRY = {
  retries: { limit: 5, delay: 5_000, backoff: 'exponential' },
  timeout: 600_000,
} satisfies WorkflowStepConfig;

export class BackupWorkflow extends WorkflowEntrypoint<WorkflowEnv, BackupWorkflowParams> {
  override async run(
    event: WorkflowEvent<BackupWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    try {
      await this.runPhases(event.payload, step);
    } catch (cause) {
      const params = event.payload;
      const errorRef = crypto.randomUUID();
      const code = cause instanceof Error ? cause.message : 'BACKUP_FAILED';
      const current = await this.env.DB.prepare(
        `SELECT status FROM data_backups WHERE tenant_id = ? AND id = ?`,
      )
        .bind(params.tenantId, params.backupId)
        .first<{ status: string }>();
      if (current?.status !== 'READY') {
        await cleanupBackupAttempt(this.env, params);
        await this.env.BACKUPS.delete(`ready/${params.tenantId}/${params.backupId}/manifest.kpbk1`);
      }
      await this.env.DB.prepare(
        `UPDATE data_backups SET status = 'FAILED', error_code = ?, error_ref = ?
         WHERE tenant_id = ? AND id = ? AND status <> 'READY'`,
      )
        .bind(code, errorRef, params.tenantId, params.backupId)
        .run();
      const backup = await this.env.DB.prepare(
        `SELECT created_by_user_id FROM data_backups WHERE tenant_id = ? AND id = ?`,
      )
        .bind(params.tenantId, params.backupId)
        .first<{ created_by_user_id: string }>();
      await appendBackupAudit(this.env.DB, {
        tenantId: params.tenantId,
        actorUserId: backup?.created_by_user_id ?? null,
        action: 'BACKUP_FAILED',
        backupId: params.backupId,
        payload: { backupId: params.backupId, errorRef },
      });
      throw cause;
    }
  }

  private async runPhases(params: BackupWorkflowParams, step: WorkflowStep): Promise<void> {
    await step.do('reserve', RETRY, async (context) => {
      await this.env.DB.prepare(
        `UPDATE data_backups SET status = 'SNAPSHOTTING', error_code = NULL, error_ref = NULL
         WHERE tenant_id = ? AND id = ? AND status IN ('PENDING','SNAPSHOTTING','FAILED')`,
      )
        .bind(params.tenantId, params.backupId)
        .run();
      console.log(
        JSON.stringify({ phase: 'reserve', backupId: params.backupId, attempt: context.attempt }),
      );
      return { backupId: params.backupId };
    });
    const exported = await step.do('export-entire-attempt', RETRY, async (context) => {
      const result = await executeBackupAttempt(this.env, params);
      console.log(
        JSON.stringify({
          phase: 'export-attempt',
          backupId: params.backupId,
          attempt: context.attempt,
          chunkCount: result.chunkCount,
          objectCount: result.objects.length,
          rowCount: result.rowCount,
        }),
      );
      return result;
    });

    const manifest = await step.do('publish-final-manifest', RETRY, async (context) => {
      const result = await publishBackupManifest(this.env, params, exported);
      console.log(
        JSON.stringify({
          phase: 'manifest',
          backupId: params.backupId,
          attempt: context.attempt,
          manifestEtag: result.etag,
        }),
      );
      return result;
    });

    await step.do('status-audit', RETRY, async (context) => {
      await finalizeBackupReady(this.env, params, exported, manifest);
      console.log(
        JSON.stringify({
          phase: 'ready',
          backupId: params.backupId,
          attempt: context.attempt,
          globalHash: exported.globalHash,
        }),
      );
    });
  }
}
