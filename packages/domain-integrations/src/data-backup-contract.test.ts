import { describe, expect, it } from 'vitest';
import {
  KPBK1_CHUNK_LIMIT_BYTES,
  buildKpbk1Plaintext,
  classifyTenantSchema,
  verifyKpbk1Backup,
  type BackupRegistry,
  type Kpbk1Source,
} from './data-backup-contract.js';

const registry: BackupRegistry = {
  version: 'registry-1',
  tables: [
    {
      name: 'sales',
      classification: 'BUSINESS',
      primaryKey: ['tenant_id', 'id'],
      columns: ['tenant_id', 'id', 'total_cents', 'receipt_r2_key'],
      r2References: ['receipt_r2_key'],
    },
    {
      name: 'sale_items',
      classification: 'BUSINESS',
      tenantVia: ['sales'],
      primaryKey: ['sale_id', 'id'],
      columns: ['sale_id', 'id', 'product_id', 'unit_price_cents'],
      r2References: [],
    },
    {
      name: 'authorization_tokens',
      classification: 'EPHEMERAL',
      reason: 'authorization token',
    },
    { name: 'api_keys', classification: 'SECRET', reason: 'credential material' },
    {
      name: 'daily_financial_rollups',
      classification: 'DERIVED',
      reason: 'rebuild from sales',
    },
  ],
};

const source = (backupId: string): Kpbk1Source => ({
  tenantId: 'tenant-a',
  backupId,
  schemaVersion: '35',
  epoch: 9,
  createdAt: '2026-08-08T20:00:00.000Z',
  actorId: 'owner-a',
  registry,
  tables: {
    sales: [
      {
        tenant_id: 'tenant-a',
        id: 'sale-2',
        total_cents: 2590,
        receipt_r2_key: 'receipts/sale-2.pdf',
      },
      {
        tenant_id: 'tenant-a',
        id: 'sale-1',
        total_cents: 1290,
        receipt_r2_key: null,
      },
    ],
    sale_items: [{ sale_id: 'sale-2', id: 'item-1', product_id: 'p-1', unit_price_cents: 2590 }],
  },
  objects: [
    {
      logicalKey: 'sale:2:receipt',
      sourceR2Key: 'receipts/sale-2.pdf',
      bytes: new TextEncoder().encode('receipt-bytes'),
      etag: 'etag-1',
    },
  ],
});

describe('KPBK1 canonical backup contract', () => {
  it('reproduces decrypted bytes and global hash while ciphertext stays randomized', async () => {
    const first = await buildKpbk1Plaintext(source('backup-1'));
    const replay = await buildKpbk1Plaintext({
      ...source('backup-2'),
      createdAt: '2026-08-08T20:05:00.000Z',
      actorId: 'owner-b',
    });

    expect(first.globalHash).toBe(replay.globalHash);
    expect(first.canonicalContentBytes).toEqual(replay.canonicalContentBytes);
    expect(first.tables.map((table) => table.plaintextBytes)).toEqual(
      replay.tables.map((table) => table.plaintextBytes),
    );

    const encryptedOnce = await first.encrypt();
    const encryptedAgain = await replay.encrypt();
    expect(encryptedOnce.wrappedDek).not.toEqual(encryptedAgain.wrappedDek);
    expect(encryptedOnce.chunks.map((chunk) => chunk.ciphertext)).not.toEqual(
      encryptedAgain.chunks.map((chunk) => chunk.ciphertext),
    );
    expect(new Set(encryptedOnce.chunks.map((chunk) => chunk.nonceHex)).size).toBe(
      encryptedOnce.chunks.length,
    );
    expect(encryptedOnce.chunks.every((chunk) => chunk.aad.format === 'KPBK1')).toBe(true);
  });

  it('uses fixed table/column/PK order, UTF-8 LF JSONL and bounded chunks', async () => {
    expect(KPBK1_CHUNK_LIMIT_BYTES).toBe(4 * 1024 * 1024);
    const backup = await buildKpbk1Plaintext(source('backup-order'));
    expect(backup.tables.map((table) => table.name)).toEqual(['sale_items', 'sales']);
    expect(new TextDecoder().decode(backup.tables[1]?.plaintextBytes)).toBe(
      '{"id":"sale-1","receipt_r2_key":null,"tenant_id":"tenant-a","total_cents":1290}\n' +
        '{"id":"sale-2","receipt_r2_key":"receipts/sale-2.pdf","tenant_id":"tenant-a","total_cents":2590}\n',
    );
    expect(
      backup.tables
        .flatMap((table) => table.chunks)
        .every(
          (chunk) =>
            chunk.plaintextSizeBytes <= KPBK1_CHUNK_LIMIT_BYTES &&
            chunk.hash.length === 64 &&
            chunk.bytes.at(-1) === 10,
        ),
    ).toBe(true);
    expect(backup.tables.every((table) => table.hash.length === 64)).toBe(true);
    expect(backup.objects.every((object) => object.hash.length === 64)).toBe(true);
    expect(backup.globalHash).toHaveLength(64);
  });

  it('fails registry completeness for direct and legacy tenant children', () => {
    const schema = {
      tenantTables: ['sales', 'new_tenant_table'],
      foreignKeys: [
        { child: 'sale_items', parent: 'sales' },
        { child: 'legacy_item_notes', parent: 'sale_items' },
      ],
      columns: {
        sales: ['tenant_id', 'id', 'total_cents', 'receipt_r2_key', 'new_column'],
        sale_items: ['sale_id', 'id', 'product_id', 'unit_price_cents'],
        legacy_item_notes: ['sale_item_id', 'note'],
        new_tenant_table: ['tenant_id', 'id'],
      },
    };

    expect(classifyTenantSchema(schema, registry)).toEqual({
      ok: false,
      unclassifiedTables: ['legacy_item_notes', 'new_tenant_table'],
      unclassifiedColumns: [{ table: 'sales', columns: ['new_column'] }],
    });
  });

  it('manifests exclusions without secret values or unsynced IndexedDB content', async () => {
    const backup = await buildKpbk1Plaintext(source('backup-exclusions'));
    expect(backup.manifest.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'api_keys', classification: 'SECRET' }),
        expect.objectContaining({
          name: 'authorization_tokens',
          classification: 'EPHEMERAL',
        }),
        expect.objectContaining({
          name: 'daily_financial_rollups',
          classification: 'DERIVED',
        }),
        expect.objectContaining({
          name: 'unsynced_indexeddb',
          classification: 'EPHEMERAL',
        }),
      ]),
    );
    expect(JSON.stringify(backup.manifest)).not.toContain('secret-value');
  });

  it('detects referenced R2 object tamper and cross-tenant manifests', async () => {
    const backup = await buildKpbk1Plaintext(source('backup-tamper'));
    await expect(
      verifyKpbk1Backup(backup.encrypted, {
        expectedTenantId: 'tenant-a',
        readObject: async () => new TextEncoder().encode('tampered'),
      }),
    ).rejects.toThrow('BACKUP_SOURCE_OBJECT_CHANGED');
    await expect(
      verifyKpbk1Backup(backup.encrypted, {
        expectedTenantId: 'tenant-b',
        readObject: async () => new TextEncoder().encode('receipt-bytes'),
      }),
    ).rejects.toThrow('BACKUP_TENANT_MISMATCH');
  });
});
