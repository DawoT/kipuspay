import { describe, expect, it } from 'vitest';
import { BackupKmsCore, type KmsEnv } from './kms-core.js';

const key = (fill: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));

function service(activeVersion: string = 'v2') {
  const env: KmsEnv = {
    BACKUP_KEK_ACTIVE_VERSION: activeVersion,
    BACKUP_KEK_V1: { get: () => Promise.resolve(key(1)) },
    BACKUP_KEK_V2: { get: () => Promise.resolve(key(2)) },
  };
  return new BackupKmsCore(env);
}

describe('Backup KMS service RPC', () => {
  it('wraps with the active version and unwraps old versions after rotation', async () => {
    const dek = new Uint8Array(32).fill(9);
    const v1 = service('v1');
    const wrapped = await v1.wrapDek({ tenantId: 'tenant-a', backupId: 'b1', dek });
    expect(wrapped.kekVersion).toBe('v1');
    await expect(
      service('v2').unwrapDek({
        tenantId: 'tenant-a',
        backupId: 'b1',
        kekVersion: wrapped.kekVersion,
        wrappedDek: wrapped.wrappedDek,
      }),
    ).resolves.toEqual(dek);
  });

  it('rejects cross-tenant, tampered, unavailable and unknown-version unwraps', async () => {
    const kms = service();
    const wrapped = await kms.wrapDek({
      tenantId: 'tenant-a',
      backupId: 'b1',
      dek: new Uint8Array(32).fill(7),
    });
    await expect(
      kms.unwrapDek({ ...wrapped, tenantId: 'tenant-b', backupId: 'b1' }),
    ).rejects.toThrow('KMS_UNWRAP_FAILED');
    await expect(
      kms.unwrapDek({ ...wrapped, tenantId: 'tenant-a', backupId: 'b2' }),
    ).rejects.toThrow('KMS_UNWRAP_FAILED');
    const tampered = Uint8Array.from(wrapped.wrappedDek);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    await expect(
      kms.unwrapDek({ ...wrapped, tenantId: 'tenant-a', backupId: 'b1', wrappedDek: tampered }),
    ).rejects.toThrow('KMS_UNWRAP_FAILED');
    await expect(
      kms.unwrapDek({
        tenantId: 'tenant-a',
        backupId: 'b1',
        kekVersion: 'missing',
        wrappedDek: wrapped.wrappedDek,
      }),
    ).rejects.toThrow('KMS_KEY_VERSION_UNAVAILABLE');
    await expect(service('missing').activeKeyVersion()).rejects.toThrow(
      'KMS_KEY_VERSION_UNAVAILABLE',
    );
  });
});
