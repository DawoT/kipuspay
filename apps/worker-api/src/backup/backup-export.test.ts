import { describe, expect, it, vi } from 'vitest';
import { runBackupExportAttempt } from './backup-export.js';

const registry = [
  {
    name: 'sales',
    classification: 'BUSINESS' as const,
    primaryKey: ['id'],
    columns: ['id', 'tenant_id', 'receipt_key'],
    r2References: ['receipt_key'],
    tenantVia: [],
  },
  {
    name: 'legacy_sale_notes',
    classification: 'BUSINESS' as const,
    primaryKey: ['sale_id', 'id'],
    columns: ['sale_id', 'id', 'note'],
    r2References: [],
    tenantVia: ['sales'],
  },
];

describe('complete backup export attempt', () => {
  it('pages every BUSINESS table including legacy children and hashes every row', async () => {
    const pages = new Map([
      [
        'sales:',
        {
          rows: [
            { id: 's1', tenant_id: 't1', receipt_key: 'receipts/r1' },
            { id: 's2', tenant_id: 't1', receipt_key: null },
          ],
          next: { id: 's2' },
          objectDescriptors: [
            { table: 'sales', column: 'receipt_key', sourceR2Key: 'receipts/r1' },
          ],
        },
      ],
      [
        'sales:s2',
        {
          rows: [{ id: 's3', tenant_id: 't1', receipt_key: null }],
          next: null,
          objectDescriptors: [],
        },
      ],
      [
        'legacy_sale_notes:',
        {
          rows: [{ sale_id: 's1', id: 'n1', note: 'legacy' }],
          next: null,
          objectDescriptors: [],
        },
      ],
    ]);
    const readTablePage = vi.fn(
      (input: { tableName: string; after: Record<string, unknown> | null }) =>
        Promise.resolve(
          pages.get(
            `${input.tableName}:${typeof input.after?.id === 'string' ? input.after.id : ''}`,
          ) ?? {
            rows: [],
            next: null,
            objectDescriptors: [],
          },
        ),
    );
    const putEncrypted = vi.fn().mockResolvedValue({
      etag: 'backup-etag',
      multipart: false,
      checkpoint: null,
    });
    const sourceBytes = new TextEncoder().encode('receipt-content');
    const result = await runBackupExportAttempt({
      tenantId: 't1',
      backupId: 'b1',
      epoch: 7,
      schemaVersion: '0035',
      registryVersion: 'registry-test',
      exclusions: [
        {
          name: 'sessions',
          classification: 'EPHEMERAL',
          reason: 'runtime',
          known_count: null,
        },
      ],
      registry,
      dek: new Uint8Array(32).fill(3),
      readTablePage,
      source: {
        head: vi.fn().mockResolvedValue({
          etag: 'source-etag',
          size: sourceBytes.byteLength,
        }),
        get: vi.fn().mockResolvedValue({
          arrayBuffer: () => Promise.resolve(sourceBytes.buffer),
        }),
      },
      destination: { putEncrypted },
    });
    expect(readTablePage.mock.calls.map(([input]) => input.tableName)).toEqual([
      'legacy_sale_notes',
      'sales',
      'sales',
    ]);
    expect(result.tables).toEqual([
      expect.objectContaining({ name: 'legacy_sale_notes', rowCount: 1 }),
      expect.objectContaining({ name: 'sales', rowCount: 3 }),
    ]);
    expect(result.objects).toEqual([
      expect.objectContaining({ sourceR2Key: 'receipts/r1', sourceEtag: 'source-etag' }),
    ]);
    expect(result.rowCount).toBe(4);
    expect(result.chunkCount).toBe(3);
    expect(result.globalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.manifest).toMatchObject({
      backup_id: 'b1',
      tenant_id: 't1',
      schema_version: '0035',
      registry_version: 'registry-test',
      global_hash: result.globalHash,
    });
    expect(
      putEncrypted.mock.calls.some(([input]) =>
        new TextDecoder().decode((input as { bytes: Uint8Array }).bytes).includes('legacy'),
      ),
    ).toBe(false);
  });

  it('fails the entire attempt when a referenced object mutates during copy', async () => {
    const sourceBytes = new TextEncoder().encode('receipt-content');
    const head = vi
      .fn()
      .mockResolvedValueOnce({ etag: 'before', size: sourceBytes.byteLength })
      .mockResolvedValueOnce({ etag: 'after', size: sourceBytes.byteLength });
    await expect(
      runBackupExportAttempt({
        tenantId: 't1',
        backupId: 'b-race',
        epoch: 8,
        registry: [registry[0]!],
        dek: new Uint8Array(32).fill(4),
        readTablePage: vi.fn().mockResolvedValue({
          rows: [{ id: 's1', tenant_id: 't1', receipt_key: 'receipts/race' }],
          next: null,
          objectDescriptors: [
            { table: 'sales', column: 'receipt_key', sourceR2Key: 'receipts/race' },
          ],
        }),
        source: {
          head,
          get: vi.fn().mockResolvedValue({
            arrayBuffer: () => Promise.resolve(sourceBytes.buffer),
          }),
        },
        destination: {
          putEncrypted: vi.fn().mockResolvedValue({
            etag: 'table-etag',
            multipart: false,
          }),
        },
      }),
    ).rejects.toThrow('BACKUP_SOURCE_OBJECT_CHANGED');
  });

  it('retries with exact ciphertext and skips duplicate final chunks', async () => {
    const stored = new Map<string, { sha256: string; bytes: Uint8Array; etag: string }>();
    let uploads = 0;
    const destination = {
      putEncrypted: vi.fn((input: { key: string; sha256: string; bytes: Uint8Array }) => {
        const existing = stored.get(input.key);
        if (existing?.sha256 === input.sha256) {
          return Promise.resolve({ etag: existing.etag, multipart: false });
        }
        uploads += 1;
        const value = { sha256: input.sha256, bytes: input.bytes, etag: `etag-${uploads}` };
        stored.set(input.key, value);
        return Promise.resolve({ etag: value.etag, multipart: false });
      }),
    };
    const input = {
      tenantId: 't1',
      backupId: 'b-retry',
      epoch: 9,
      registry: [registry[1]!],
      dek: new Uint8Array(32).fill(5),
      readTablePage: vi.fn().mockResolvedValue({
        rows: [{ sale_id: 's1', id: 'n1', note: 'same' }],
        next: null,
        objectDescriptors: [],
      }),
      source: {
        head: vi.fn(),
        get: vi.fn(),
      },
      destination,
    };
    const first = await runBackupExportAttempt(input);
    const retried = await runBackupExportAttempt(input);
    expect(uploads).toBe(1);
    expect(retried.globalHash).toBe(first.globalHash);
    expect(retried.tables[0]?.chunks[0]?.ciphertextHash).toBe(
      first.tables[0]?.chunks[0]?.ciphertextHash,
    );
  });
});
