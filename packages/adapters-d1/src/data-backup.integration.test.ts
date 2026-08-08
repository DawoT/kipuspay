import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import migration0035 from '../migrations/0035_sprint42_data_backup.sql?raw';
import down0035 from '../migrations-down/0035_sprint42_data_backup.sql?raw';
import {
  appendBackupAudit,
  assertBackupRegistryComplete,
  createBackupSnapshotReader,
  runRestoreDryRun,
  runRestoreDryRunAudited,
} from './data-backup.js';

describe('Sprint 42 audit chain coordinator', () => {
  it('guards the tenant tail inside the same batch to prevent concurrent forks', async () => {
    const batch = vi.fn().mockResolvedValue([]);
    const first = vi.fn().mockResolvedValue({ row_hash: 'tail-a' });
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...params: unknown[]) => ({ sql, params, first, run: vi.fn() })),
      })),
      batch,
    };
    await appendBackupAudit(db, {
      tenantId: 'tenant-a',
      actorUserId: 'owner-a',
      action: 'BACKUP_DOWNLOADED',
      backupId: 'backup-a',
      payload: { backupId: 'backup-a' },
    });
    const statements = batch.mock.calls[0]?.[0] as { sql: string }[];
    expect(statements[0]?.sql).toContain('atomic_guards');
    expect(statements[0]?.sql).toContain('SELECT row_hash FROM audit_events');
    expect(statements[1]?.sql).toContain('INSERT INTO audit_events');
    expect(statements[2]?.sql).toContain('DELETE FROM atomic_guards');
  });

  it('emits restore start then PASSED or FAILED result with safe metadata', async () => {
    const appendAudit = vi.fn().mockResolvedValue(undefined);
    await expect(
      runRestoreDryRunAudited({
        db: {} as never,
        tenantId: 'tenant-a',
        backupId: 'backup-a',
        actorUserId: 'owner-a',
        manifestHash: 'a'.repeat(64),
        verify: vi.fn().mockResolvedValue(undefined),
        appendAudit,
      }),
    ).resolves.toEqual({ status: 'PASSED' });
    expect(appendAudit.mock.calls.map(([, event]) => event.action)).toEqual([
      'RESTORE_DRY_RUN_STARTED',
      'RESTORE_DRY_RUN_PASSED',
    ]);

    appendAudit.mockClear();
    await expect(
      runRestoreDryRunAudited({
        db: {} as never,
        tenantId: 'tenant-a',
        backupId: 'backup-a',
        actorUserId: 'owner-a',
        manifestHash: 'b'.repeat(64),
        verify: vi.fn().mockRejectedValue(new Error('provider secret must not leak')),
        appendAudit,
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_DRY_RUN_FAILED' });
    expect(appendAudit.mock.calls.map(([, event]) => event.action)).toEqual([
      'RESTORE_DRY_RUN_STARTED',
      'RESTORE_DRY_RUN_FAILED',
    ]);
    expect(JSON.stringify(appendAudit.mock.calls)).not.toContain('provider secret');
  });

  it('serializes concurrent restore results into one tenant audit chain', async () => {
    const tenantId = 'backup-audit-chain-tenant';
    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Audit SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    )
      .bind(tenantId)
      .run();
    await env.DB.prepare(
      `INSERT INTO users (id, tenant_id, email, role)
       VALUES ('backup-audit-owner', ?, 'backup-audit@example.test', 'owner')`,
    )
      .bind(tenantId)
      .run();
    await Promise.all([
      appendBackupAudit(env.DB, {
        tenantId,
        actorUserId: 'backup-audit-owner',
        action: 'RESTORE_DRY_RUN_PASSED',
        backupId: 'backup-concurrent-a',
        payload: { manifestHash: 'a'.repeat(64) },
      }),
      appendBackupAudit(env.DB, {
        tenantId,
        actorUserId: 'backup-audit-owner',
        action: 'RESTORE_DRY_RUN_FAILED',
        backupId: 'backup-concurrent-b',
        payload: { code: 'RESTORE_VERIFY_FAILED', manifestHash: 'b'.repeat(64) },
      }),
    ]);
    const rows = await env.DB.prepare(
      `SELECT prev_hash, row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at, id`,
    )
      .bind(tenantId)
      .all<{ prev_hash: string | null; row_hash: string }>();
    expect(rows.results).toHaveLength(2);
    const roots = rows.results.filter((row) => row.prev_hash === null);
    expect(roots).toHaveLength(1);
    const root = roots[0]!;
    expect(rows.results.some((row) => row.prev_hash === root.row_hash)).toBe(true);
  });
});

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

  it('dry-run validator performs zero D1 or R2 writes', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn().mockResolvedValue(undefined);
    const result = await runRestoreDryRun({
      tenantId: 'tenant-a',
      backupId: 'backup-a',
      execute,
      putObject,
    });
    expect(result.status).toBe('PASSED');
    expect(execute).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it('rejects restore apply during Sprint 42', async () => {
    const reader = createBackupSnapshotReader({});
    await expect(
      reader.applyRestore({ tenantId: 'tenant-a', backupId: 'backup-a' }),
    ).rejects.toMatchObject({ status: 501, code: 'RESTORE_APPLY_NOT_AVAILABLE' });
  });

  it('matches the declarative registry against the fully migrated sqlite schema', async () => {
    await expect(assertBackupRegistryComplete(env.DB)).resolves.toBeUndefined();
  });

  it('pages a real tenant table in full-PK order and rejects table-name input', async () => {
    const tenantId = 'backup-reader-tenant';
    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Reader SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    )
      .bind(tenantId)
      .run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents)
         VALUES ('product-z', ?, 'Z', 'Zulu', 'physical', 'NIU', 10)`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents)
         VALUES ('product-a', ?, 'A', 'Alpha', 'physical', 'NIU', 20)`,
      ).bind(tenantId),
    ]);
    const reader = createBackupSnapshotReader({ db: env.DB });
    const page = await reader.readTablePage({
      tenantId,
      tableName: 'products',
      after: null,
      limit: 10,
    });
    expect(page.rows.map((row) => row.id)).toEqual(['product-a', 'product-z']);
    await expect(
      reader.readTablePage({
        tenantId,
        tableName: 'products; DROP TABLE tenants',
        after: null,
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_TABLE_NOT_REGISTERED' });
  });

  it('pages multiple real pages and includes tenant-via legacy children deterministically', async () => {
    const tenantId = 'backup-multipage-tenant';
    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Multipage SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    )
      .bind(tenantId)
      .run();
    await env.DB.prepare(
      `INSERT INTO suppliers (id, tenant_id, business_name)
       VALUES ('backup-supplier', ?, 'Supplier SAC')`,
    )
      .bind(tenantId)
      .run();
    await env.DB.batch(
      ['ap-c', 'ap-a', 'ap-b'].map((id) =>
        env.DB.prepare(
          `INSERT INTO accounts_payable (
             id, tenant_id, supplier_id, original_amount_cents, balance_due_cents, due_date
           ) VALUES (?, ?, 'backup-supplier', 100, 100, '2026-08-31')`,
        ).bind(id, tenantId),
      ),
    );
    await env.DB.batch(
      ['pay-c', 'pay-a', 'pay-b'].map((id, index) =>
        env.DB.prepare(
          `INSERT INTO accounts_payable_payments (
             id, accounts_payable_id, amount_cents, payment_method
           ) VALUES (?, ?, 10, 'cash')`,
        ).bind(id, ['ap-c', 'ap-a', 'ap-b'][index]),
      ),
    );
    const reader = createBackupSnapshotReader({ db: env.DB });
    const first = await reader.readTablePage({
      tenantId,
      tableName: 'accounts_payable',
      after: null,
      limit: 2,
    });
    const second = await reader.readTablePage({
      tenantId,
      tableName: 'accounts_payable',
      after: first.next,
      limit: 2,
    });
    expect(first.rows.map((row) => row.id)).toEqual(['ap-a', 'ap-b']);
    expect(second.rows.map((row) => row.id)).toEqual(['ap-c']);
    expect(second.next).toBeNull();

    const childFirst = await reader.readTablePage({
      tenantId,
      tableName: 'accounts_payable_payments',
      after: null,
      limit: 2,
    });
    const childSecond = await reader.readTablePage({
      tenantId,
      tableName: 'accounts_payable_payments',
      after: childFirst.next,
      limit: 2,
    });
    expect(childFirst.rows.map((row) => row.id)).toEqual(['pay-a', 'pay-b']);
    expect(childSecond.rows.map((row) => row.id)).toEqual(['pay-c']);
  });

  it('real D1 triggers bump epochs and rollback the bump with a failed batch', async () => {
    const tenantId = 'backup-epoch-tenant';
    await env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Epoch SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    )
      .bind(tenantId)
      .run();
    await env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents)
       VALUES ('epoch-product', ?, 'EPOCH', 'Epoch', 'physical', 'NIU', 100)`,
    )
      .bind(tenantId)
      .run();
    const before = await env.DB.prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
      .bind(tenantId)
      .first<{ epoch: number }>();
    expect(before?.epoch).toBeGreaterThan(0);

    await expect(
      env.DB.batch([
        env.DB.prepare(
          `UPDATE products SET name = 'Must rollback' WHERE tenant_id = ? AND id = 'epoch-product'`,
        ).bind(tenantId),
        env.DB.prepare(
          `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents)
           VALUES ('epoch-product', ?, 'DUP', 'Duplicate', 'physical', 'NIU', 100)`,
        ).bind(tenantId),
      ]),
    ).rejects.toThrow();
    const after = await env.DB.prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
      .bind(tenantId)
      .first<{ epoch: number }>();
    const product = await env.DB.prepare(
      `SELECT name FROM products WHERE id = 'epoch-product'`,
    ).first<{
      name: string;
    }>();
    expect(after?.epoch).toBe(before?.epoch);
    expect(product?.name).toBe('Epoch');
  });

  it('enforces cross-tenant backup FKs and protected down abort/success', async () => {
    for (const tenantId of ['backup-fk-a', 'backup-fk-b']) {
      await env.DB.prepare(
        `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
         VALUES (?, ?, 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
      )
        .bind(tenantId, `${tenantId} SAC`)
        .run();
    }
    await env.DB.prepare(
      `INSERT INTO users (id, tenant_id, email, role)
       VALUES ('backup-user-a', 'backup-fk-a', 'backup-a@example.test', 'owner')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO data_backups (
         id, tenant_id, idempotency_key, format_version, registry_version,
         schema_version, snapshot_epoch, created_by_user_id
       ) VALUES ('backup-a', 'backup-fk-a', 'idem-a', 'KPBK1', 'registry-1', '35', 0,
                 'backup-user-a')`,
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO data_backup_chunks (
           id, tenant_id, backup_id, table_name, ordinal, row_count,
           plaintext_size_bytes, ciphertext_size_bytes, plaintext_hash, ciphertext_hash,
           nonce, auth_tag, r2_key
         ) VALUES ('chunk-cross', 'backup-fk-b', 'backup-a', 'products', 0, 0, 0, 0,
                   ?, ?, zeroblob(12), zeroblob(16), 'staging/chunk')`,
      )
        .bind('a'.repeat(64), 'b'.repeat(64))
        .run(),
    ).rejects.toThrow();
    await expect(env.DB.exec(down0035)).rejects.toThrow(/BACKUP_DOWN_PROTECTED|constraint/i);
    await env.DB.prepare(`UPDATE data_backups SET status = 'DELETED' WHERE id = 'backup-a'`).run();
    await env.DB.exec(down0035);
    const table = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'data_backups'`,
    ).first();
    expect(table).toBeNull();
  });
});
