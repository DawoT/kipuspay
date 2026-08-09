/* eslint-disable no-secrets/no-secrets -- protocol error codes and deterministic test keys are not secrets */
import { describe, expect, it } from 'vitest';
import { PushKmsCore, type PushKmsEnv } from './push-kms-core.js';

function secret(value: string): { get(): Promise<string> } {
  return { get: () => Promise.resolve(value) };
}

const keyV1 = btoa(String.fromCharCode(...new Uint8Array(32).fill(17)));
const keyV2 = btoa(String.fromCharCode(...new Uint8Array(32).fill(29)));
const context = {
  tenantId: 'tenant-rotation',
  subscriptionId: 'subscription-rotation',
  purpose: 'ENDPOINT_TOKEN',
} as const;

function environment(active: string, revoked = ''): PushKmsEnv {
  return {
    PUSH_KEK_ACTIVE_VERSION: active,
    PUSH_REVOKED_KEY_VERSIONS: revoked,
    PUSH_KEK_V1: secret(keyV1),
    PUSH_KEK_V2: secret(keyV2),
  };
}

describe('Sprint 45 push envelope rotation and isolation', () => {
  it('rotates ciphertext to the active version without changing its fingerprint', async () => {
    const original = await new PushKmsCore(environment('push-kms-v1')).encrypt(
      context,
      'opaque-provider-token',
    );
    const rotated = await new PushKmsCore(environment('push-kms-v2')).rotate({
      ...context,
      ciphertext: original.ciphertext,
      keyVersion: original.keyVersion,
    });
    expect(rotated.keyVersion).toBe('push-kms-v2');
    expect(rotated.fingerprint).toBe(original.fingerprint);
    await expect(
      new PushKmsCore(environment('push-kms-v2')).decrypt({
        ...context,
        ciphertext: rotated.ciphertext,
        keyVersion: rotated.keyVersion,
      }),
    ).resolves.toBe('opaque-provider-token');
  });

  it('fails closed for revoked versions and cross-tenant/device envelope reuse', async () => {
    const envelope = await new PushKmsCore(environment('push-kms-v1')).encrypt(
      context,
      'opaque-provider-token',
    );
    await expect(
      new PushKmsCore(environment('push-kms-v2', 'push-kms-v1')).decrypt({
        ...context,
        ciphertext: envelope.ciphertext,
        keyVersion: envelope.keyVersion,
      }),
    ).rejects.toThrow('PUSH_KMS_KEY_REVOKED');
    await expect(
      new PushKmsCore(environment('push-kms-v1')).decrypt({
        ...context,
        tenantId: 'tenant-other',
        ciphertext: envelope.ciphertext,
        keyVersion: envelope.keyVersion,
      }),
    ).rejects.toThrow('PUSH_KMS_DECRYPT_FAILED');
  });
});
