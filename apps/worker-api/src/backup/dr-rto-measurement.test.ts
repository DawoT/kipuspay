import { afterEach, describe, expect, it, vi } from 'vitest';
import { D1_BACKUP_REGISTRY_VERSION, RTO_TARGET_MS } from '@kipuspay/adapters-d1';
import type * as AdaptersD1 from '@kipuspay/adapters-d1';
import type * as BackupRestoreValidator from './backup-restore-validator.js';
import { runDrSimulationHttp } from './dr-routes.js';

const drMocks = vi.hoisted(() => ({
  appendBackupAudit: vi.fn(async () => undefined),
  applyRestoreRowsToShard: vi.fn(async () => ({ tables: 1, rowsInserted: 1 })),
  rebuildAuditChainHeadsOnDrShard: vi.fn(async () => ({ tenants: 1 })),
  rebuildDerivedRollupsOnDrShard: vi.fn(async () => ({ reportDates: ['2026-09-16'] })),
  verifyDrReplay: vi.fn(async () => ({
    salesCount: 1,
    expectedSalesCount: 1,
    rollupLatestDay: '2026-09-16',
    duplicatesBlocked: 3,
    rpoTxZero: true,
    rpoRollupOneDay: true,
  })),
  validateReadyBackup: vi.fn(async (_env, input) => {
    input.collectRestoreRows?.(new Map([['sales', [{ id: 'sale-1' }]]]));
  }),
}));

vi.mock('@kipuspay/adapters-d1', async (importOriginal) => {
  const actual = await importOriginal<typeof AdaptersD1>();
  return {
    ...actual,
    appendBackupAudit: drMocks.appendBackupAudit,
    applyRestoreRowsToShard: drMocks.applyRestoreRowsToShard,
    rebuildAuditChainHeadsOnDrShard: drMocks.rebuildAuditChainHeadsOnDrShard,
    rebuildDerivedRollupsOnDrShard: drMocks.rebuildDerivedRollupsOnDrShard,
    verifyDrReplay: drMocks.verifyDrReplay,
  };
});

vi.mock('./backup-restore-validator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof BackupRestoreValidator>();
  return { ...actual, validateReadyBackup: drMocks.validateReadyBackup };
});

function simulationDb(): D1Database {
  const statement = (sql: string): D1PreparedStatement => ({
    bind: () => statement(sql),
    first: async <T>() => {
      if (sql.includes('tenant_capabilities')) {
        return { enabled: 1, config_json: '{}', epoch: 0 } as T;
      }
      if (sql.includes('FROM data_backups')) {
        return {
          id: 'backup-1',
          global_hash: 'a'.repeat(64),
          registry_version: D1_BACKUP_REGISTRY_VERSION,
          schema_version: '0035',
          kek_version: 'v1',
          wrapped_dek: new Uint8Array([1]).buffer,
          manifest_r2_key: 'ready/t/backup-1/manifest.kpbk1',
        } as T;
      }
      return null;
    },
    run: async <T>() => ({
      success: true,
      meta: {
        changes: sql.includes('authorization_tokens') ? 1 : 0,
        duration: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        size_after: 0,
        changed_db: sql.includes('authorization_tokens'),
      },
      results: [] as T[],
    }),
    all: async <T>() => ({
      success: true,
      meta: {
        changes: 0,
        duration: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        size_after: 0,
        changed_db: false,
      },
      results: [] as T[],
    }),
    raw: async () => [],
  });
  const session: D1DatabaseSession = {
    prepare: (sql) => statement(sql),
    batch: async () => [],
    getBookmark: () => null,
  };
  return {
    prepare: (sql) => statement(sql),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    withSession: () => session,
    dump: async () => new ArrayBuffer(0),
  };
}

describe('DR simulation RTO measurement', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('includes post-restore RPO/replay verification in measured RTO', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00.000Z'));
    drMocks.verifyDrReplay.mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(RTO_TARGET_MS + 1);
      return {
        salesCount: 1,
        expectedSalesCount: 1,
        rollupLatestDay: '2026-09-16',
        duplicatesBlocked: 3,
        rpoTxZero: true,
        rpoRollupOneDay: true,
      };
    });

    const db = simulationDb();
    const result = await runDrSimulationHttp(
      {
        FEATURE_PLATFORM_DR: '1',
        DB: db,
        DR_DB: db,
        BACKUPS: { get: async () => null },
        BACKUP_KMS: { unwrapDek: async () => new Uint8Array(32) },
      },
      { tenantId: 'tenant-1', userId: 'owner-1', role: 'owner' },
      { backupId: 'backup-1', stepUpToken: 'one-shot-token', nowMs: Date.now() },
    );

    expect(result.status).toBe(422);
    expect(result.body.code).toBe('RTO_EXCEEDED');
    expect(result.body.rtoMs).toBe(RTO_TARGET_MS + 1);
  });
});
