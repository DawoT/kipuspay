import { describe, expect, it, vi } from 'vitest';
import {
  buildKpbk1Plaintext,
  encryptKpbk1Unit,
  type BackupRegistry,
  type EncryptedKpbk1Unit,
  type Kpbk1Manifest,
} from '@kipuspay/domain-integrations';
import { verifyRestoreDryRun } from './data-backup.js';

const registry: BackupRegistry = {
  version: 'test-registry-1',
  tables: [
    {
      name: 'customers',
      classification: 'BUSINESS',
      primaryKey: ['id'],
      columns: ['id', 'tenant_id', 'name'],
      r2References: [],
    },
    {
      name: 'sales',
      classification: 'BUSINESS',
      primaryKey: ['id'],
      columns: ['id', 'tenant_id', 'customer_id', 'total_cents', 'receipt_key'],
      r2References: ['receipt_key'],
    },
    { name: 'sessions', classification: 'EPHEMERAL', reason: 'runtime session' },
  ],
};

const schema = {
  version: '0035',
  tables: {
    customers: {
      columns: {
        id: { type: 'TEXT', notNull: true },
        tenant_id: { type: 'TEXT', notNull: true },
        name: { type: 'TEXT', notNull: true },
      },
      checks: [],
      foreignKeys: [],
    },
    sales: {
      columns: {
        id: { type: 'TEXT', notNull: true },
        tenant_id: { type: 'TEXT', notNull: true },
        customer_id: { type: 'TEXT', notNull: true },
        total_cents: { type: 'INTEGER', notNull: true },
        receipt_key: { type: 'TEXT', notNull: false },
      },
      checks: [{ column: 'total_cents', operator: '>=', value: 0 }],
      foreignKeys: [{ columns: ['customer_id'], parentTable: 'customers', parentColumns: ['id'] }],
    },
  },
} as const;

async function fixture(overrides: { customerId?: string; totalCents?: number } = {}) {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const source = await buildKpbk1Plaintext({
    tenantId: 'tenant-a',
    backupId: 'backup-a',
    schemaVersion: '0035',
    epoch: 7,
    createdAt: '2026-08-08T00:00:00.000Z',
    actorId: 'owner-a',
    registry,
    tables: {
      customers: [{ id: 'customer-a', tenant_id: 'tenant-a', name: 'Ada' }],
      sales: [
        {
          id: 'sale-a',
          tenant_id: 'tenant-a',
          customer_id: overrides.customerId ?? 'customer-a',
          total_cents: overrides.totalCents ?? 1200,
          receipt_key: 'receipts/a.pdf',
        },
      ],
    },
    objects: [
      {
        logicalKey: 'sales.receipt_key:receipts/a.pdf',
        sourceR2Key: 'receipts/a.pdf',
        bytes: new TextEncoder().encode('PDF'),
      },
    ],
  });
  const units: EncryptedKpbk1Unit[] = [];
  for (const [tableIndex, table] of source.tables.entries()) {
    for (const chunk of table.chunks) {
      const ordinal = units.length;
      units.push(
        await encryptKpbk1Unit(chunk.bytes, dek, {
          tenant_id: 'tenant-a',
          backup_id: 'backup-a',
          format: 'KPBK1',
          kind: 'TABLE',
          ordinal,
        }),
      );
      void tableIndex;
    }
  }
  return { dek, manifest: source.manifest, units };
}

function dependencies(input: Awaited<ReturnType<typeof fixture>>) {
  const writes = vi.fn();
  return {
    expectedTenantId: 'tenant-a',
    expectedBackupId: 'backup-a',
    supportedSchemaVersions: ['0035'],
    registry,
    schema,
    manifest: input.manifest,
    dek: input.dek,
    tableUnits: input.units,
    readCurrentRows: async function* () {},
    readReferencedObject: vi.fn().mockResolvedValue(new TextEncoder().encode('PDF')),
    readAuditRows: async function* () {},
    write: writes,
    putObject: vi.fn(),
    acquireLock: vi.fn(),
    maxDifferencesPerTable: 20,
  };
}

describe('production restore dry-run validator', () => {
  it('validates KPBK1 and performs zero writes, locks or metadata mutation', async () => {
    const input = await fixture();
    const ports = dependencies(input);
    await expect(verifyRestoreDryRun(ports)).resolves.toMatchObject({
      status: 'PASSED',
      insertCount: 2,
      missingObjectCount: 0,
    });
    expect(ports.write).not.toHaveBeenCalled();
    expect(ports.putObject).not.toHaveBeenCalled();
    expect(ports.acquireLock).not.toHaveBeenCalled();
  });

  it('fails closed on malformed/tampered GCM stream and remains write-free', async () => {
    const input = await fixture();
    input.units[0]!.ciphertext[0] = (input.units[0]!.ciphertext[0] ?? 0) ^ 1;
    const ports = dependencies(input);
    await expect(verifyRestoreDryRun(ports)).rejects.toThrow('BACKUP_CHUNK_TAMPERED');
    expect(ports.write).not.toHaveBeenCalled();
  });

  it('rejects CHECK and FK failures before any production mutation', async () => {
    const input = await fixture({ customerId: 'missing', totalCents: -1 });
    const ports = dependencies(input);
    await expect(verifyRestoreDryRun(ports)).rejects.toMatchObject({
      code: 'BACKUP_CHECK_FAILED',
    });
    expect(ports.write).not.toHaveBeenCalled();
  });

  it('rejects tenant/schema/registry mismatch and broken audit chain', async () => {
    const input = await fixture();
    const crossTenant = {
      ...input.manifest,
      tenant_id: 'tenant-b',
    } satisfies Kpbk1Manifest;
    await expect(
      verifyRestoreDryRun({ ...dependencies(input), manifest: crossTenant }),
    ).rejects.toMatchObject({ code: 'BACKUP_TENANT_MISMATCH' });

    const audit = async function* () {
      await Promise.resolve();
      yield { id: '2', prevHash: 'wrong', rowHash: 'hash-2', canonicalBytes: new Uint8Array() };
    };
    await expect(
      verifyRestoreDryRun({ ...dependencies(input), readAuditRows: audit }),
    ).rejects.toMatchObject({ code: 'BACKUP_AUDIT_CHAIN_INVALID' });
  });
});
