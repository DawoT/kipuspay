import { D1_BACKUP_REGISTRY_VERSION } from '@kipuspay/adapters-d1';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, encryptKpbk1Unit } from '@kipuspay/domain-integrations';
import {
  domainRegistry,
  parseChecks,
  safeRestoreValidationError,
  validateReadyBackup,
} from './backup-restore-validator.js';

function dbWith(row: Record<string, unknown> | null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(row),
        all: vi.fn().mockResolvedValue({ results: [] }),
      })),
    })),
  };
}

const ready = {
  manifest_r2_key: 'ready/t/b/manifest.kpbk1',
  wrapped_dek: new Uint8Array([1]).buffer,
  kek_version: 'kek-1',
  schema_version: '0035',
  registry_version: D1_BACKUP_REGISTRY_VERSION,
  global_hash: 'a'.repeat(64),
};

describe('production restore validation loader', () => {
  it('builds exhaustive registry and parses SQLite CHECK predicates', () => {
    const registry = domainRegistry();
    expect(registry.version).toBe(D1_BACKUP_REGISTRY_VERSION);
    expect(registry.tables.some((table) => table.name === 'sales')).toBe(true);
    expect(registry.tables.some((table) => table.classification === 'SECRET')).toBe(true);
    expect(
      parseChecks(
        `CREATE TABLE sample (
           amount_cents INTEGER CHECK (amount_cents >= 0),
           status TEXT CHECK (status IN ('OPEN','CLOSED'))
         )`,
      ),
    ).toEqual([
      { column: 'amount_cents', operator: '>=', value: 0 },
      { column: 'status', operator: 'IN', value: ['OPEN', 'CLOSED'] },
    ]);
    expect(parseChecks(null)).toEqual([]);
  });

  it('fails opaquely when READY backup is absent', async () => {
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(null) as never,
          BACKUPS: { get: () => Promise.resolve(null) },
          BACKUP_KMS: {},
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects pre-0056 registry-1 snapshots as STALE before KMS unwrap', async () => {
    const unwrapDek = vi.fn();
    await expect(
      validateReadyBackup(
        {
          DB: dbWith({ ...ready, registry_version: 'registry-1' }) as never,
          BACKUPS: { get: () => Promise.resolve(null) },
          BACKUP_KMS: { unwrapDek },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({
      code: 'BACKUP_REGISTRY_STALE',
      expected: D1_BACKUP_REGISTRY_VERSION,
      actual: 'registry-1',
      mismatch: 'registry_version',
    });
    expect(unwrapDek).not.toHaveBeenCalled();
  });

  it('unwraps only through KMS and fails closed when unavailable', async () => {
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: { get: () => Promise.resolve(null) },
          BACKUP_KMS: {
            unwrapDek: vi.fn().mockRejectedValue(new Error('provider secret')),
          },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_KMS_UNAVAILABLE' });
  });

  it('supports the KMS unwrap port and rejects missing/invalid R2 manifest data', async () => {
    const unwrap = vi.fn().mockResolvedValue(new Uint8Array(32));
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: { get: vi.fn().mockResolvedValue(null) },
          BACKUP_KMS: { unwrap },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_R2_OBJECT_MISSING' });
    expect(unwrap).toHaveBeenCalledOnce();

    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: {
            get: vi.fn().mockResolvedValue({
              customMetadata: { nonce: 'not-hex' },
              arrayBuffer: () => Promise.resolve(new Uint8Array(16).buffer),
            }),
          },
          BACKUP_KMS: { unwrap },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_MANIFEST_INVALID' });
  });

  it('rejects malformed and GCM-tampered manifests before reading chunks', async () => {
    const malformedBucket = {
      get: vi.fn().mockResolvedValue({
        customMetadata: {},
        arrayBuffer: () => Promise.resolve(new Uint8Array(16).buffer),
      }),
    };
    const invalidCode = ['BACKUP', 'MANIFEST', 'INVALID'].join('_');
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: malformedBucket,
          BACKUP_KMS: { unwrapDek: vi.fn().mockResolvedValue(new Uint8Array(32)) },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({ code: invalidCode });

    const tamperedBucket = {
      get: vi.fn().mockResolvedValue({
        customMetadata: { nonce: '00'.repeat(12) },
        arrayBuffer: () => Promise.resolve(new Uint8Array(32).buffer),
      }),
    };
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: tamperedBucket,
          BACKUP_KMS: { unwrapDek: vi.fn().mockResolvedValue(new Uint8Array(32)) },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toThrow('BACKUP_CHUNK_TAMPERED');
  });

  it('decrypts a canonical manifest then rejects control-plane mismatch', async () => {
    const dek = new Uint8Array(32).fill(7);
    const aad = {
      tenant_id: 'tenant-a',
      backup_id: 'backup-a',
      format: 'KPBK1' as const,
      kind: 'MANIFEST' as const,
      ordinal: 0,
    };
    const manifest = {
      backup_id: 'backup-a',
      epoch: 1,
      exclusions: [],
      format_version: 'KPBK1',
      global_hash: 'b'.repeat(64),
      objects: [],
      registry_version: D1_BACKUP_REGISTRY_VERSION,
      schema_version: '0035',
      tables: [],
      tenant_id: 'tenant-a',
    };
    const encrypted = await encryptKpbk1Unit(
      new TextEncoder().encode(canonicalJson(manifest)),
      dek,
      aad,
      new Uint8Array(12).fill(2),
    );
    const sealed = new Uint8Array(encrypted.ciphertext.byteLength + encrypted.authTag.byteLength);
    sealed.set(encrypted.ciphertext);
    sealed.set(encrypted.authTag, encrypted.ciphertext.byteLength);
    const bucket = {
      get: vi.fn().mockResolvedValue({
        customMetadata: { nonce: encrypted.nonceHex },
        arrayBuffer: () => Promise.resolve(sealed.buffer),
      }),
    };
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: bucket,
          BACKUP_KMS: { unwrapDek: vi.fn().mockResolvedValue(dek) },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_MANIFEST_MISMATCH' });

    const matching = { ...manifest, global_hash: ready.global_hash };
    const matchingEncrypted = await encryptKpbk1Unit(
      new TextEncoder().encode(canonicalJson(matching)),
      dek,
      aad,
      new Uint8Array(12).fill(3),
    );
    const matchingSealed = new Uint8Array(
      matchingEncrypted.ciphertext.byteLength + matchingEncrypted.authTag.byteLength,
    );
    matchingSealed.set(matchingEncrypted.ciphertext);
    matchingSealed.set(matchingEncrypted.authTag, matchingEncrypted.ciphertext.byteLength);
    await expect(
      validateReadyBackup(
        {
          DB: dbWith(ready) as never,
          BACKUPS: {
            get: vi.fn().mockResolvedValue({
              customMetadata: { nonce: matchingEncrypted.nonceHex },
              arrayBuffer: () => Promise.resolve(matchingSealed.buffer),
            }),
          },
          BACKUP_KMS: { unwrapDek: vi.fn().mockResolvedValue(dek) },
        },
        { tenantId: 'tenant-a', backupId: 'backup-a' },
      ),
    ).rejects.toThrow('BACKUP_REGISTRY_INCOMPLETE');
  });

  it('allowlists validation codes and hides unknown provider details', () => {
    expect(safeRestoreValidationError(new Error('BACKUP_CHECK_FAILED'))).toMatchObject({
      code: 'BACKUP_CHECK_FAILED',
    });
    const safe = safeRestoreValidationError(new Error('SQL provider password=secret'));
    expect(safe.code).toBe('RESTORE_VERIFY_FAILED');
    expect(safe.errorRef).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(safe)).not.toContain('password');
  });
});
