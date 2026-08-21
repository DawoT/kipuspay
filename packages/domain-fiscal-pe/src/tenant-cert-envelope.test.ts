import { describe, expect, it } from 'vitest';
import {
  bytesFromBase64,
  bytesToBase64,
  envelopeBinary,
  openPkcs8WithDek,
  parseTenantCertEnvelope,
  randomDek,
  sealPkcs8WithDek,
  serializeTenantCertEnvelope,
  TENANT_CERT_DEK_BYTES,
} from './tenant-cert-envelope.js';

describe('tenant cert PKCS8 envelope', () => {
  it('sella y abre PKCS#8 con un DEK de 32 bytes', async () => {
    const dek = randomDek();
    expect(dek.byteLength).toBe(TENANT_CERT_DEK_BYTES);
    const pkcs8 = crypto.getRandomValues(new Uint8Array(64));
    const { nonce, ciphertext } = await sealPkcs8WithDek(dek, pkcs8);
    const opened = await openPkcs8WithDek(dek, nonce, ciphertext);
    expect(opened).toEqual(pkcs8);
  });

  it('serializa envelope v1 y rechaza JSON inválido o DEK corto', async () => {
    const json = serializeTenantCertEnvelope({
      kekVersion: 'v1',
      backupId: 'tenant-cert:SUNAT',
      wrappedDekB64: btoa('x'.repeat(60)),
      nonceB64: btoa('n'.repeat(12)),
      ciphertextB64: btoa('c'.repeat(32)),
    });
    const parsed = parseTenantCertEnvelope(json);
    expect(parsed.v).toBe(1);
    expect(parsed.kekVersion).toBe('v1');
    expect(envelopeBinary(parsed).nonce.byteLength).toBe(12);
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe(btoa('\u0001\u0002\u0003'));
    expect(bytesFromBase64(btoa('ab')).byteLength).toBe(2);
    expect(() => parseTenantCertEnvelope('{')).toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    expect(() => parseTenantCertEnvelope('{"v":2}')).toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    expect(() => parseTenantCertEnvelope('{"v":1,"kekVersion":"v1"}')).toThrow(
      /TENANT_CERT_ENVELOPE_INVALID/,
    );
    expect(() => parseTenantCertEnvelope('[]')).toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    expect(() => parseTenantCertEnvelope('null')).toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    expect(() => parseTenantCertEnvelope('1')).toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    expect(() =>
      envelopeBinary({
        ...parsed,
        wrappedDekB64: '!!!',
      }),
    ).toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    await expect(sealPkcs8WithDek(new Uint8Array(16), new Uint8Array(64))).rejects.toThrow(
      /TENANT_CERT_DEK_INVALID/,
    );
    await expect(sealPkcs8WithDek(randomDek(), new Uint8Array(4))).rejects.toThrow(
      /TENANT_CERT_PKCS8_INVALID/,
    );
    await expect(
      openPkcs8WithDek(randomDek(), new Uint8Array(1), new Uint8Array(16)),
    ).rejects.toThrow(/TENANT_CERT_ENVELOPE_INVALID/);
    await expect(
      openPkcs8WithDek(
        new Uint8Array(16),
        crypto.getRandomValues(new Uint8Array(12)),
        new Uint8Array(16),
      ),
    ).rejects.toThrow(/TENANT_CERT_DEK_INVALID/);
    const dek = randomDek();
    const pkcs8 = crypto.getRandomValues(new Uint8Array(64));
    const sealed = await sealPkcs8WithDek(dek, pkcs8);
    await expect(openPkcs8WithDek(randomDek(), sealed.nonce, sealed.ciphertext)).rejects.toThrow(
      /TENANT_CERT_UNWRAP_FAILED/,
    );
  });
});
