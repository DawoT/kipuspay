import type { SecretStoreSecret } from './kms-core.js';

export interface PushKmsEnv {
  readonly PUSH_KEK_ACTIVE_VERSION: string;
  readonly PUSH_REVOKED_KEY_VERSIONS?: string;
  readonly PUSH_KEK_V1?: SecretStoreSecret;
  readonly PUSH_KEK_V2?: SecretStoreSecret;
  readonly PUSH_KEK_V3?: SecretStoreSecret;
}

export interface PushEnvelopeContext {
  readonly tenantId: string;
  readonly subscriptionId: string;
  readonly purpose: 'ENDPOINT_TOKEN' | 'WEB_PUSH_CREDENTIAL';
}

export interface PushEncryptedEnvelope {
  readonly ciphertext: string;
  readonly keyVersion: string;
  readonly fingerprint: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function pushKmsError(code: string): Error {
  const error = new Error(code);
  error.name = 'PushKmsError';
  return error;
}

function decodeBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw pushKmsError('PUSH_KMS_KEY_UNAVAILABLE');
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw pushKmsError('PUSH_KMS_DECRYPT_FAILED');
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function aad(context: PushEnvelopeContext, version: string): Uint8Array {
  return encoder.encode(
    `KIPUSPAY-PUSH-KMS-V1\0${context.tenantId}\0${context.subscriptionId}\0${context.purpose}\0${version}`,
  );
}

export class PushKmsCore {
  private readonly env: PushKmsEnv;

  constructor(env: PushKmsEnv) {
    this.env = env;
  }

  private bindingFor(version: string): SecretStoreSecret {
    const binding =
      version === 'push-kms-v1'
        ? this.env.PUSH_KEK_V1
        : version === 'push-kms-v2'
          ? this.env.PUSH_KEK_V2
          : version === 'push-kms-v3'
            ? this.env.PUSH_KEK_V3
            : undefined;
    if (!binding) throw pushKmsError('PUSH_KMS_KEY_VERSION_UNAVAILABLE');
    return binding;
  }

  async verifyKeyVersion(version: string): Promise<void> {
    if (this.env.PUSH_REVOKED_KEY_VERSIONS === undefined) {
      throw pushKmsError('PUSH_KMS_REVOCATION_UNAVAILABLE');
    }
    const revoked = new Set(
      this.env.PUSH_REVOKED_KEY_VERSIONS.split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
    if (revoked.has(version)) throw pushKmsError('PUSH_KMS_KEY_REVOKED');
    await this.bindingFor(version).get();
  }

  async activeKeyVersion(): Promise<string> {
    const version = this.env.PUSH_KEK_ACTIVE_VERSION;
    await this.verifyKeyVersion(version);
    return version;
  }

  private async key(version: string): Promise<CryptoKey> {
    await this.verifyKeyVersion(version);
    const bytes = decodeBase64(await this.bindingFor(version).get());
    if (bytes.byteLength !== 32) throw pushKmsError('PUSH_KMS_KEY_UNAVAILABLE');
    return crypto.subtle.importKey('raw', buffer(bytes), { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
  }

  async encrypt(context: PushEnvelopeContext, plaintext: string): Promise<PushEncryptedEnvelope> {
    if (!plaintext) throw pushKmsError('PUSH_KMS_PLAINTEXT_INVALID');
    const keyVersion = await this.activeKeyVersion();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = encoder.encode(plaintext);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: buffer(nonce),
          additionalData: buffer(aad(context, keyVersion)),
          tagLength: 128,
        },
        await this.key(keyVersion),
        buffer(plaintextBytes),
      ),
    );
    const envelope = new Uint8Array(nonce.byteLength + sealed.byteLength);
    envelope.set(nonce);
    envelope.set(sealed, nonce.byteLength);
    return {
      ciphertext: base64Url(envelope),
      keyVersion,
      fingerprint: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', plaintextBytes))),
    };
  }

  async decrypt(
    context: PushEnvelopeContext & { readonly ciphertext: string; readonly keyVersion: string },
  ): Promise<string> {
    await this.verifyKeyVersion(context.keyVersion);
    const envelope = fromBase64Url(context.ciphertext);
    if (envelope.byteLength < 29) throw pushKmsError('PUSH_KMS_DECRYPT_FAILED');
    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: buffer(envelope.slice(0, 12)),
          additionalData: buffer(aad(context, context.keyVersion)),
          tagLength: 128,
        },
        await this.key(context.keyVersion),
        buffer(envelope.slice(12)),
      );
      return decoder.decode(plaintext);
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith('PUSH_KMS_')) throw cause;
      throw pushKmsError('PUSH_KMS_DECRYPT_FAILED');
    }
  }

  async rotate(
    context: PushEnvelopeContext & { readonly ciphertext: string; readonly keyVersion: string },
  ): Promise<PushEncryptedEnvelope> {
    const plaintext = await this.decrypt(context);
    return this.encrypt(context, plaintext);
  }
}
