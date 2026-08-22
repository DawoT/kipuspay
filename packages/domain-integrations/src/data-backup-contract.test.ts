import { describe, expect, it } from 'vitest';
import {
  KPBK1_CHUNK_LIMIT_BYTES,
  buildKpbk1Plaintext,
  canonicalJson,
  classifyTenantSchema,
  decryptKpbk1Unit,
  encryptKpbk1Unit,
  parseKpbk1Jsonl,
  parseKpbk1Manifest,
  validateRestoreDryRun,
  verifyKpbk1Backup,
  type BackupRegistry,
  type BackupKeyWrapPort,
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

  it('strictly rejects malformed manifests, JSONL and tampered chunks', async () => {
    expect(() => parseKpbk1Manifest('{"format_version":"KPBK1","unknown":true}')).toThrow(
      'BACKUP_MANIFEST_INVALID',
    );
    expect(() => parseKpbk1Jsonl(new TextEncoder().encode('{"id":"x"}\r\n'))).toThrow(
      'BACKUP_JSONL_INVALID',
    );
    expect(() => parseKpbk1Jsonl(new TextEncoder().encode('{"id":1.5}\n'))).toThrow(
      'BACKUP_JSONL_INVALID',
    );

    const backup = await buildKpbk1Plaintext(source('backup-corrupt'));
    const encrypted = await backup.encrypt();
    const firstChunk = encrypted.chunks[0];
    expect(firstChunk).toBeDefined();
    if (!firstChunk) return;
    firstChunk.ciphertext[0] = (firstChunk.ciphertext[0] ?? 0) ^ 1;
    await expect(
      verifyKpbk1Backup(encrypted, {
        expectedTenantId: 'tenant-a',
        readObject: async () => new TextEncoder().encode('receipt-bytes'),
      }),
    ).rejects.toThrow('BACKUP_CHUNK_TAMPERED');
  });

  it('keeps KEK rotation behind the wrap port boundary', async () => {
    const wrappedVersions: string[] = [];
    const keyPort: BackupKeyWrapPort = {
      wrapDek: async ({ dek, kekVersion }) => {
        wrappedVersions.push(kekVersion);
        return new Uint8Array([...new TextEncoder().encode(kekVersion), 0, ...dek]);
      },
      unwrapDek: async ({ wrappedDek, kekVersion }) => {
        const separator = wrappedDek.indexOf(0);
        expect(new TextDecoder().decode(wrappedDek.slice(0, separator))).toBe(kekVersion);
        return wrappedDek.slice(separator + 1);
      },
    };
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const aad = {
      tenant_id: 'tenant-a',
      backup_id: 'backup-key',
      format: 'KPBK1' as const,
      kind: 'TABLE' as const,
      ordinal: 0,
    };
    const first = await encryptKpbk1Unit(new TextEncoder().encode('same'), dek, aad);
    const second = await encryptKpbk1Unit(new TextEncoder().encode('same'), dek, aad);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
    await expect(decryptKpbk1Unit(first, dek, aad)).resolves.toEqual(
      new TextEncoder().encode('same'),
    );
    const fixedNonce = new Uint8Array(12).fill(6);
    const deterministic = await encryptKpbk1Unit(
      new TextEncoder().encode('same'),
      dek,
      aad,
      fixedNonce,
    );
    expect(deterministic.nonce).toEqual(fixedNonce);
    await expect(
      encryptKpbk1Unit(new TextEncoder().encode('same'), dek, aad, new Uint8Array(11)),
    ).rejects.toThrow('BACKUP_NONCE_INVALID');

    const backup = await buildKpbk1Plaintext(source('backup-key'), {
      keyWrap: keyPort,
      kekVersion: 'kek-7',
    });
    expect(backup.encrypted.kekVersion).toBe('kek-7');
    expect(wrappedVersions).toEqual(['kek-7']);
  });

  it('validates restore dry-run purely and bounds reported differences', () => {
    expect(
      validateRestoreDryRun({
        expectedTenantId: 'tenant-a',
        manifestTenantId: 'tenant-a',
        schemaVersion: '35',
        supportedSchemaVersions: ['35'],
        differences: Array.from({ length: 3 }, (_, index) => ({
          table: 'sales',
          key: String(index),
          action: 'UPDATE' as const,
        })),
        maxDifferences: 2,
      }),
    ).toEqual({
      status: 'PASSED',
      differences: [
        { table: 'sales', key: '0', action: 'UPDATE' },
        { table: 'sales', key: '1', action: 'UPDATE' },
      ],
      truncated: true,
    });
    expect(() =>
      validateRestoreDryRun({
        expectedTenantId: 'tenant-b',
        manifestTenantId: 'tenant-a',
        schemaVersion: '35',
        supportedSchemaVersions: ['35'],
        differences: [],
        maxDifferences: 10,
      }),
    ).toThrow('BACKUP_TENANT_MISMATCH');
  });

  it('rejects non-canonical values and invalid registry rows', async () => {
    expect(canonicalJson({ z: 'n\u0303', a: [null, true, 2] })).toBe('{"a":[null,true,2],"z":"ñ"}');
    expect(() => canonicalJson(1.5)).toThrow('BACKUP_JSON_NUMBER_INVALID');
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow('BACKUP_JSON_NUMBER_INVALID');
    expect(() => canonicalJson(undefined)).toThrow('BACKUP_JSON_VALUE_INVALID');

    const missingPk: BackupRegistry = {
      version: 'bad',
      tables: [
        {
          name: 'sales',
          classification: 'BUSINESS',
          primaryKey: [],
          columns: ['id'],
          r2References: [],
        },
      ],
    };
    await expect(
      buildKpbk1Plaintext({
        ...source('bad-pk'),
        registry: missingPk,
        tables: { sales: [{ id: 'x' }] },
        objects: [],
      }),
    ).rejects.toThrow('BACKUP_REGISTRY_PK_REQUIRED');

    const salesOnly: BackupRegistry = {
      version: 'rows',
      tables: [
        {
          name: 'sales',
          classification: 'BUSINESS',
          primaryKey: ['id'],
          columns: ['id', 'tenant_id'],
          r2References: [],
        },
      ],
    };
    await expect(
      buildKpbk1Plaintext({
        ...source('missing-column'),
        registry: salesOnly,
        tables: { sales: [{ id: 'x' }] },
        objects: [],
      }),
    ).rejects.toThrow('BACKUP_ROW_COLUMN_MISSING');
    await expect(
      buildKpbk1Plaintext({
        ...source('extra-column'),
        registry: salesOnly,
        tables: { sales: [{ id: 'x', tenant_id: 'tenant-a', extra: true }] },
        objects: [],
      }),
    ).rejects.toThrow('BACKUP_ROW_COLUMN_UNREGISTERED');
    await expect(
      buildKpbk1Plaintext({
        ...source('oversized-row'),
        registry: salesOnly,
        tables: {
          sales: [{ id: 'x'.repeat(KPBK1_CHUNK_LIMIT_BYTES), tenant_id: 'tenant-a' }],
        },
        objects: [],
      }),
    ).rejects.toThrow('BACKUP_ROW_EXCEEDS_CHUNK_LIMIT');
  });

  it('covers nullable PK ordering and deterministic multi-chunk boundaries', async () => {
    const large = 'x'.repeat(2_200_000);
    const largeRegistry: BackupRegistry = {
      version: 'large',
      tables: [
        {
          name: 'large_rows',
          classification: 'BUSINESS',
          primaryKey: ['part', 'id'],
          columns: ['part', 'id', 'payload'],
          r2References: [],
        },
      ],
    };
    const backup = await buildKpbk1Plaintext({
      ...source('large'),
      registry: largeRegistry,
      tables: {
        large_rows: [
          { part: 'a', id: '2', payload: large },
          { part: null, id: '0', payload: 'first' },
          { part: 'a', id: '1', payload: large },
        ],
      },
      objects: [],
    });
    expect(backup.tables[0]?.chunks).toHaveLength(2);
    expect(new TextDecoder().decode(backup.tables[0]?.plaintextBytes).startsWith('{"id":"0"')).toBe(
      true,
    );

    const prefixRegistry: BackupRegistry = {
      version: 'prefix',
      tables: ['aa', 'a'].map((name) => ({
        name,
        classification: 'BUSINESS' as const,
        primaryKey: ['id'],
        columns: ['id'],
        r2References: [],
      })),
    };
    const prefixes = await buildKpbk1Plaintext({
      ...source('prefixes'),
      registry: prefixRegistry,
      tables: { a: [{ id: 'same' }, { id: 'same' }], aa: [] },
      objects: [],
    });
    expect(prefixes.tables.map((table) => table.name)).toEqual(['a', 'aa']);
  });

  it('strictly handles parser encodings and canonical manifest shape', async () => {
    expect(parseKpbk1Jsonl(new Uint8Array())).toEqual([]);
    for (const invalid of [
      '{"id":"x"}',
      '\uFEFF{"id":"x"}\n',
      '[]\n',
      'null\n',
      '{"z":1,"a":2}\n',
      'not-json\n',
    ]) {
      expect(() => parseKpbk1Jsonl(new TextEncoder().encode(invalid))).toThrow(
        'BACKUP_JSONL_INVALID',
      );
    }
    expect(() => parseKpbk1Jsonl(new Uint8Array([0xff, 0x0a]))).toThrow('BACKUP_JSONL_INVALID');

    const backup = await buildKpbk1Plaintext(source('manifest-parse'));
    const canonical = canonicalJson(backup.manifest);
    expect(parseKpbk1Manifest(new TextEncoder().encode(canonical))).toEqual(backup.manifest);
    for (const invalid of [
      'null',
      '[]',
      '{}',
      canonical.replace('"KPBK1"', '"KPBK2"'),
      `${canonical} `,
    ]) {
      expect(() => parseKpbk1Manifest(invalid)).toThrow('BACKUP_MANIFEST_INVALID');
    }
  });

  it('fails closed for invalid crypto parameters and detached envelopes', async () => {
    const aad = {
      tenant_id: 'tenant-a',
      backup_id: 'crypto-errors',
      format: 'KPBK1' as const,
      kind: 'TABLE' as const,
      ordinal: 0,
    };
    await expect(encryptKpbk1Unit(new Uint8Array(), new Uint8Array(31), aad)).rejects.toThrow(
      'BACKUP_DEK_INVALID',
    );
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const unit = await encryptKpbk1Unit(new TextEncoder().encode('ok'), dek, aad);
    await expect(decryptKpbk1Unit(unit, dek, { ...aad, ordinal: 1 })).rejects.toThrow(
      'BACKUP_AAD_MISMATCH',
    );

    const backup = await buildKpbk1Plaintext(source('detached'));
    const detached = { ...backup.encrypted, keyWrap: undefined };
    await expect(
      verifyKpbk1Backup(detached, {
        expectedTenantId: 'tenant-a',
        readObject: async () => new TextEncoder().encode('receipt-bytes'),
      }),
    ).rejects.toThrow('BACKUP_KMS_UNAVAILABLE');

    const badHash = await buildKpbk1Plaintext(source('bad-hash'));
    const originalHash = badHash.encrypted.chunks[0]?.plaintextHash;
    expect(originalHash).toBeDefined();
    if (!badHash.encrypted.chunks[0]) return;
    Object.assign(badHash.encrypted.chunks[0], { plaintextHash: '0'.repeat(64) });
    await expect(
      verifyKpbk1Backup(badHash.encrypted, {
        expectedTenantId: 'tenant-a',
        readObject: async () => new TextEncoder().encode('receipt-bytes'),
      }),
    ).rejects.toThrow('BACKUP_CHUNK_TAMPERED');
  });

  it('covers registry success and remaining dry-run guards', () => {
    expect(
      classifyTenantSchema(
        {
          tenantTables: ['sales'],
          foreignKeys: [{ child: 'sale_items', parent: 'sales' }],
          columns: {
            sales: ['tenant_id', 'id', 'total_cents', 'receipt_r2_key'],
            sale_items: ['sale_id', 'id', 'product_id', 'unit_price_cents'],
          },
        },
        registry,
      ),
    ).toEqual({ ok: true, unclassifiedTables: [], unclassifiedColumns: [] });
    for (const input of [
      { schemaVersion: '99', supportedSchemaVersions: ['35'], maxDifferences: 1 },
      { schemaVersion: '35', supportedSchemaVersions: ['35'], maxDifferences: -1 },
      { schemaVersion: '35', supportedSchemaVersions: ['35'], maxDifferences: 1.5 },
    ]) {
      expect(() =>
        validateRestoreDryRun({
          expectedTenantId: 'tenant-a',
          manifestTenantId: 'tenant-a',
          differences: [],
          ...input,
        }),
      ).toThrow();
    }
  });
});
