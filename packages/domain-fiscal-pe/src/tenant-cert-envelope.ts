/**
 * Sobre AES-GCM para PKCS#8 de certificado SUNAT. El DEK (32 bytes) se envuelve
 * con worker-kms (`wrapDek`); el ciphertext nunca viaja a D1/KV/R2 — solo
 * Secrets Store. Arquitectura §5.4 / SEC-03 / ADR-FISCAL-006.
 */

export const TENANT_CERT_ENVELOPE_V = 1;
export const TENANT_CERT_DEK_BYTES = 32;
export const TENANT_CERT_NONCE_BYTES = 12;

export interface TenantCertEnvelopeV1 {
  readonly v: typeof TENANT_CERT_ENVELOPE_V;
  readonly kekVersion: string;
  readonly backupId: string;
  readonly wrappedDekB64: string;
  readonly nonceB64: string;
  readonly ciphertextB64: string;
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function derToBase64(der: Uint8Array): string {
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToDer(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
  } catch {
    throw new Error('TENANT_CERT_ENVELOPE_INVALID');
  }
}

export function randomDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(TENANT_CERT_DEK_BYTES));
}

export async function sealPkcs8WithDek(
  dek: Uint8Array,
  pkcs8: Uint8Array,
): Promise<{ readonly nonce: Uint8Array; readonly ciphertext: Uint8Array }> {
  if (dek.byteLength !== TENANT_CERT_DEK_BYTES) throw new Error('TENANT_CERT_DEK_INVALID');
  if (pkcs8.byteLength < 16) throw new Error('TENANT_CERT_PKCS8_INVALID');
  const nonce = crypto.getRandomValues(new Uint8Array(TENANT_CERT_NONCE_BYTES));
  const key = await crypto.subtle.importKey('raw', asBuffer(dek), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asBuffer(nonce), tagLength: 128 },
      key,
      asBuffer(pkcs8),
    ),
  );
  return { nonce, ciphertext: sealed };
}

export async function openPkcs8WithDek(
  dek: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  if (dek.byteLength !== TENANT_CERT_DEK_BYTES) throw new Error('TENANT_CERT_DEK_INVALID');
  if (nonce.byteLength !== TENANT_CERT_NONCE_BYTES) throw new Error('TENANT_CERT_ENVELOPE_INVALID');
  try {
    const key = await crypto.subtle.importKey('raw', asBuffer(dek), { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asBuffer(nonce), tagLength: 128 },
        key,
        asBuffer(ciphertext),
      ),
    );
  } catch {
    throw new Error('TENANT_CERT_UNWRAP_FAILED');
  }
}

export function serializeTenantCertEnvelope(
  envelope: Omit<TenantCertEnvelopeV1, 'v'> & { readonly v?: 1 },
): string {
  const body: TenantCertEnvelopeV1 = {
    v: TENANT_CERT_ENVELOPE_V,
    kekVersion: envelope.kekVersion,
    backupId: envelope.backupId,
    wrappedDekB64: envelope.wrappedDekB64,
    nonceB64: envelope.nonceB64,
    ciphertextB64: envelope.ciphertextB64,
  };
  return JSON.stringify(body);
}

export function parseTenantCertEnvelope(raw: string): TenantCertEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('TENANT_CERT_ENVELOPE_INVALID');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('TENANT_CERT_ENVELOPE_INVALID');
  const row = parsed as Record<string, unknown>;
  if (row.v !== TENANT_CERT_ENVELOPE_V) throw new Error('TENANT_CERT_ENVELOPE_INVALID');
  if (
    typeof row.kekVersion !== 'string' ||
    typeof row.backupId !== 'string' ||
    typeof row.wrappedDekB64 !== 'string' ||
    typeof row.nonceB64 !== 'string' ||
    typeof row.ciphertextB64 !== 'string'
  ) {
    throw new Error('TENANT_CERT_ENVELOPE_INVALID');
  }
  return {
    v: TENANT_CERT_ENVELOPE_V,
    kekVersion: row.kekVersion,
    backupId: row.backupId,
    wrappedDekB64: row.wrappedDekB64,
    nonceB64: row.nonceB64,
    ciphertextB64: row.ciphertextB64,
  };
}

export function envelopeBinary(envelope: TenantCertEnvelopeV1): {
  readonly wrappedDek: Uint8Array;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
} {
  return {
    wrappedDek: base64ToDer(envelope.wrappedDekB64),
    nonce: base64ToDer(envelope.nonceB64),
    ciphertext: base64ToDer(envelope.ciphertextB64),
  };
}

export { derToBase64 as bytesToBase64, base64ToDer as bytesFromBase64 };
