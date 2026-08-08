import { describe, expect, it, vi } from 'vitest';
import migration0035 from '../migrations/0035_sprint42_data_backup.sql?raw';
import down0035 from '../migrations-down/0035_sprint42_data_backup.sql?raw';
import {
  assertBackupRegistryComplete,
  createBackupSnapshotReader,
  runRestoreDryRun,
} from './data-backup.js';

describe('Sprint 42 D1 backup schema and registry', () => {
  it('migration 0035 contains the complete DAT-12 target and protected down', () => {
    for (const table of [
      'data_backups',
      'data_backup_chunks',
      'data_backup_objects',
      'data_backup_table_manifests',
      'restore_dry_runs',
      'tenant_data_epochs',
    ]) {
      expect(migration0035).toContain(`CREATE TABLE ${table}`);
    }
    expect(migration0035).toContain('data.backup.sprint42');
    expect(migration0035).toContain('UNIQUE (tenant_id, idempotency_key)');
    expect(migration0035).toContain(
      'FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)',
    );
    expect(migration0035).toContain('CHECK (length(nonce) = 12');
    expect(migration0035).toContain('CHECK (length(auth_tag) = 16');
    expect(migration0035).toContain('error_ref TEXT');
    expect(down0035).toContain('BACKUP_DOWN_PROTECTED');
    expect(down0035.indexOf('DROP TABLE data_backup_chunks')).toBeLessThan(
      down0035.indexOf('DROP TABLE data_backups'),
    );
  });

  it('rejects every unclassified direct or legacy tenant child', async () => {
    const db = {
      listTables: vi.fn().mockResolvedValue([
        { name: 'sales', tenantScoped: true },
        { name: 'sale_items', parent: 'sales' },
        { name: 'legacy_item_notes', parent: 'sale_items' },
        { name: 'unknown_tenant_table', tenantScoped: true },
      ]),
      listColumns: vi.fn().mockResolvedValue({
        sales: ['tenant_id', 'id', 'total_cents', 'unexpected'],
      }),
    };
    await expect(assertBackupRegistryComplete(db)).rejects.toMatchObject({
      code: 'BACKUP_REGISTRY_INCOMPLETE',
      tables: ['legacy_item_notes', 'unknown_tenant_table'],
      columns: [{ table: 'sales', columns: ['unexpected'] }],
    });
  });
});

describe('Sprint 42 epoch reader and dry-run', () => {
  it('retries epoch drift from zero, then aborts without blocking POS', async () => {
    const epochs = [4, 5, 5, 6, 6, 7];
    const readEpoch = vi.fn(async () => epochs.shift() ?? 7);
    const discardStaging = vi.fn().mockResolvedValue(undefined);
    const abortMultipart = vi.fn().mockResolvedValue(undefined);
    const acquireBusinessWriteLock = vi.fn();
    const reader = createBackupSnapshotReader({
      readEpoch,
      readPage: vi.fn().mockResolvedValue([{ id: 'sale-1' }]),
      discardStaging,
      abortMultipart,
      acquireBusinessWriteLock,
      maxAttempts: 3,
    });

    await expect(reader.capture({ tenantId: 'tenant-a' })).rejects.toMatchObject({
      code: 'BACKUP_EPOCH_DRIFT',
    });
    expect(discardStaging).toHaveBeenCalledTimes(3);
    expect(abortMultipart).toHaveBeenCalledOnce();
    expect(acquireBusinessWriteLock).not.toHaveBeenCalled();
  });

  it('increments epoch in the same D1 batch as each BUSINESS mutation', async () => {
    const batch = vi.fn().mockResolvedValue(undefined);
    const db = {
      prepare: vi.fn((sql: string) => ({ sql, bind: vi.fn(() => ({ sql })) })),
      batch,
    };
    const reader = createBackupSnapshotReader({ db });
    await reader.writeBusinessMutation({
      tenantId: 'tenant-a',
      statement: { sql: 'UPDATE sales SET status = ? WHERE tenant_id = ? AND id = ?' },
    });
    expect(batch).toHaveBeenCalledOnce();
    const statements = batch.mock.calls[0]?.[0] as { sql: string }[];
    expect(statements).toHaveLength(2);
    expect(statements[1]?.sql).toContain('UPDATE tenant_data_epochs');
  });

  it('dry-run verifies and persists only control-plane results with zero BUSINESS writes', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn().mockResolvedValue(undefined);
    const result = await runRestoreDryRun({
      tenantId: 'tenant-a',
      backupId: 'backup-a',
      execute,
      putObject,
    });
    expect(result.status).toBe('PASSED');
    const sql = execute.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toMatch(/restore_dry_runs/);
    expect(sql).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:sales|sale_items|products)\b/i,
    );
    expect(putObject).not.toHaveBeenCalled();
  });

  it('rejects restore apply during Sprint 42', async () => {
    const reader = createBackupSnapshotReader({});
    await expect(
      reader.applyRestore({ tenantId: 'tenant-a', backupId: 'backup-a' }),
    ).rejects.toMatchObject({ status: 501, code: 'RESTORE_APPLY_NOT_AVAILABLE' });
  });
});
