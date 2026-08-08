import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import {
  buildKpbk1Plaintext,
  encryptKpbk1Unit,
  parseKpbk1Manifest,
  type BackupRegistry,
  type BackupRow,
  type EncryptedKpbk1Unit,
} from '@kipuspay/domain-integrations';
import { verifyRestoreDryRun, type RestoreDryRunVerificationInput } from './data-backup.js';

const registry: BackupRegistry = {
  version: 'workerd-registry-1',
  tables: [
    {
      name: 'parents',
      classification: 'BUSINESS',
      primaryKey: ['id'],
      columns: ['id', 'tenant_id'],
      r2References: [],
    },
    {
      name: 'children',
      classification: 'BUSINESS',
      primaryKey: ['id'],
      columns: ['id', 'tenant_id', 'parent_id', 'amount_cents', 'evidence_key'],
      r2References: ['evidence_key'],
    },
  ],
};

const schema: RestoreDryRunVerificationInput['schema'] = {
  version: '0035',
  tables: {
    parents: {
      columns: {
        id: { type: 'TEXT', notNull: true },
        tenant_id: { type: 'TEXT', notNull: true },
      },
      checks: [],
      foreignKeys: [],
    },
    children: {
      columns: {
        id: { type: 'TEXT', notNull: true },
        tenant_id: { type: 'TEXT', notNull: true },
        parent_id: { type: 'TEXT', notNull: true },
        amount_cents: { type: 'INTEGER', notNull: true },
        evidence_key: { type: 'TEXT', notNull: false },
      },
      checks: [{ column: 'amount_cents', operator: '>=', value: 0 }],
      foreignKeys: [{ columns: ['parent_id'], parentTable: 'parents', parentColumns: ['id'] }],
    },
  },
};

async function fixture(options: { parentId?: string; amountCents?: number } = {}) {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const built = await buildKpbk1Plaintext({
    tenantId: 'tenant-workerd',
    backupId: 'backup-workerd',
    schemaVersion: '0035',
    epoch: 1,
    createdAt: '2026-08-08T00:00:00.000Z',
    actorId: 'owner-workerd',
    registry,
    tables: {
      parents: [{ id: 'parent-1', tenant_id: 'tenant-workerd' }],
      children: [
        {
          id: 'child-1',
          tenant_id: 'tenant-workerd',
          parent_id: options.parentId ?? 'parent-1',
          amount_cents: options.amountCents ?? 1,
          evidence_key: 'evidence/1',
        },
      ],
    },
    objects: [
      {
        logicalKey: 'evidence/1',
        sourceR2Key: 'evidence/1',
        bytes: new TextEncoder().encode('evidence'),
      },
    ],
  });
  const units: EncryptedKpbk1Unit[] = [];
  for (const table of built.tables) {
    for (const chunk of table.chunks) {
      units.push(
        await encryptKpbk1Unit(chunk.bytes, dek, {
          tenant_id: 'tenant-workerd',
          backup_id: 'backup-workerd',
          format: 'KPBK1',
          kind: 'TABLE',
          ordinal: units.length,
        }),
      );
    }
  }
  return { built, dek, units };
}

async function totalChanges(): Promise<number> {
  const row = await env.DB.prepare(`SELECT total_changes() AS changes`).first<{
    changes: number;
  }>();
  return row?.changes ?? -1;
}

function ports(value: Awaited<ReturnType<typeof fixture>>): RestoreDryRunVerificationInput & {
  readonly write: ReturnType<typeof vi.fn>;
  readonly putObject: ReturnType<typeof vi.fn>;
  readonly acquireLock: ReturnType<typeof vi.fn>;
} {
  return {
    expectedTenantId: 'tenant-workerd',
    expectedBackupId: 'backup-workerd',
    supportedSchemaVersions: ['0035'],
    registry,
    schema,
    manifest: value.built.manifest,
    dek: value.dek,
    tableUnits: value.units,
    readCurrentRows: async function* (_table: string): AsyncGenerator<BackupRow> {
      await Promise.resolve();
    },
    readReferencedObject: () => Promise.resolve(new TextEncoder().encode('evidence')),
    readAuditRows: async function* () {
      await Promise.resolve();
    },
    maxDifferencesPerTable: 10,
    write: vi.fn(),
    putObject: vi.fn(),
    acquireLock: vi.fn(),
  };
}

async function expectUnchanged(
  operation: () => Promise<unknown>,
  spies: {
    write: ReturnType<typeof vi.fn>;
    putObject: ReturnType<typeof vi.fn>;
    acquireLock: ReturnType<typeof vi.fn>;
  },
  expectedCode?: string,
) {
  const before = await totalChanges();
  if (expectedCode) await expect(operation()).rejects.toThrow(expectedCode);
  else await expect(operation()).resolves.toMatchObject({ status: 'PASSED' });
  const after = await totalChanges();
  const controlProbe = await totalChanges();
  // workerd's D1 test binding advances total_changes once per probe; the
  // validator contributes no additional delta.
  expect(after - before).toBe(controlProbe - after);
  expect(spies.write).not.toHaveBeenCalled();
  expect(spies.putObject).not.toHaveBeenCalled();
  expect(spies.acquireLock).not.toHaveBeenCalled();
}

describe('workerd D1 restore validator zero-write proof', () => {
  it('keeps total_changes unchanged on pass', async () => {
    const value = await fixture();
    const input = ports(value);
    await expectUnchanged(() => verifyRestoreDryRun(input), input);
  });

  it('keeps total_changes unchanged for malformed manifest', async () => {
    const value = await fixture();
    const input = ports(value);
    await expectUnchanged(
      async () => {
        parseKpbk1Manifest(new TextEncoder().encode('{"format_version":"KPBK1"}'));
      },
      input,
      'BACKUP_MANIFEST_INVALID',
    );
  });

  it('keeps total_changes unchanged for GCM tag and hash tamper', async () => {
    const tagValue = await fixture();
    const tagInput = ports(tagValue);
    tagValue.units[0]!.authTag[0] = (tagValue.units[0]!.authTag[0] ?? 0) ^ 1;
    await expectUnchanged(() => verifyRestoreDryRun(tagInput), tagInput, 'BACKUP_CHUNK_TAMPERED');

    const hashValue = await fixture();
    const hashInput = ports(hashValue);
    hashValue.units[0] = { ...hashValue.units[0]!, plaintextHash: '0'.repeat(64) };
    await expectUnchanged(() => verifyRestoreDryRun(hashInput), hashInput, 'BACKUP_CHUNK_TAMPERED');
  });

  it('keeps total_changes unchanged for schema and tenant mismatch', async () => {
    const value = await fixture();
    const schemaInput = { ...ports(value), supportedSchemaVersions: [] };
    await expectUnchanged(
      () => verifyRestoreDryRun(schemaInput),
      schemaInput,
      'BACKUP_SCHEMA_UNSUPPORTED',
    );
    const tenantInput = { ...ports(value), expectedTenantId: 'other-tenant' };
    await expectUnchanged(
      () => verifyRestoreDryRun(tenantInput),
      tenantInput,
      'BACKUP_TENANT_MISMATCH',
    );
  });

  it('keeps total_changes unchanged for FK and CHECK failure', async () => {
    const fkValue = await fixture({ parentId: 'missing' });
    const fkInput = ports(fkValue);
    await expectUnchanged(() => verifyRestoreDryRun(fkInput), fkInput, 'BACKUP_FK_FAILED');

    const checkValue = await fixture({ amountCents: -1 });
    const checkInput = ports(checkValue);
    await expectUnchanged(() => verifyRestoreDryRun(checkInput), checkInput, 'BACKUP_CHECK_FAILED');
  });

  it('keeps total_changes unchanged for audit-chain failure and missing R2 object', async () => {
    const auditValue = await fixture();
    const auditInput = {
      ...ports(auditValue),
      readAuditRows: async function* () {
        await Promise.resolve();
        yield {
          id: 'audit-1',
          prevHash: 'broken',
          rowHash: 'a'.repeat(64),
          canonicalBytes: new Uint8Array(),
        };
      },
    };
    await expectUnchanged(
      () => verifyRestoreDryRun(auditInput),
      auditInput,
      'BACKUP_AUDIT_CHAIN_INVALID',
    );

    const objectValue = await fixture();
    const objectInput = {
      ...ports(objectValue),
      readReferencedObject: () => Promise.resolve(null),
    };
    await expectUnchanged(
      () => verifyRestoreDryRun(objectInput),
      objectInput,
      'BACKUP_SOURCE_OBJECT_CHANGED',
    );
  });
});
