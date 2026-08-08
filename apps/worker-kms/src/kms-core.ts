export interface SecretStoreSecret {
  get(): Promise<string>;
}

export interface KmsEnv {
  readonly BACKUP_KEK_ACTIVE_VERSION: string;
  readonly BACKUP_KEK_V1?: SecretStoreSecret;
  readonly BACKUP_KEK_V2?: SecretStoreSecret;
}

export interface WrappedDek {
  readonly wrappedDek: Uint8Array;
  readonly kekVersion: string;
}

interface DekContext {
  readonly tenantId: string;
  readonly backupId: string;
}

const encoder = new TextEncoder();

function error(code: string): Error {
  const value = new Error(code);
  value.name = 'KmsError';
  return value;
}

function aad(input: DekContext, version: string): Uint8Array {
  return encoder.encode(`KPBK1\0${input.tenantId}\0${input.backupId}\0${version}`);
}

function decodeBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw error('KMS_KEY_UNAVAILABLE');
  }
}

export class BackupKmsCore {
  private readonly env: KmsEnv;

  constructor(env: KmsEnv) {
    this.env = env;
  }

  private bindingFor(version: string): SecretStoreSecret {
    const binding =
      version === 'v1'
        ? this.env.BACKUP_KEK_V1
        : version === 'v2'
          ? this.env.BACKUP_KEK_V2
          : undefined;
    if (!binding) throw error('KMS_KEY_VERSION_UNAVAILABLE');
    return binding;
  }

  private async key(version: string): Promise<CryptoKey> {
    const bytes = decodeBase64(await this.bindingFor(version).get());
    if (bytes.byteLength !== 32) throw error('KMS_KEY_UNAVAILABLE');
    return crypto.subtle.importKey(
      'raw',
      Uint8Array.from(bytes).buffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  async activeKeyVersion(): Promise<string> {
    const version = this.env.BACKUP_KEK_ACTIVE_VERSION;
    await this.bindingFor(version).get();
    return version;
  }

  async wrapDek(input: DekContext & { readonly dek: Uint8Array }): Promise<WrappedDek> {
    if (input.dek.byteLength !== 32) throw error('KMS_DEK_INVALID');
    const kekVersion = await this.activeKeyVersion();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: Uint8Array.from(nonce).buffer,
          additionalData: Uint8Array.from(aad(input, kekVersion)).buffer,
          tagLength: 128,
        },
        await this.key(kekVersion),
        Uint8Array.from(input.dek).buffer,
      ),
    );
    const wrappedDek = new Uint8Array(nonce.byteLength + sealed.byteLength);
    wrappedDek.set(nonce);
    wrappedDek.set(sealed, nonce.byteLength);
    return { wrappedDek, kekVersion };
  }

  async unwrapDek(input: DekContext & WrappedDek): Promise<Uint8Array> {
    if (input.wrappedDek.byteLength !== 60) throw error('KMS_UNWRAP_FAILED');
    try {
      const nonce = input.wrappedDek.slice(0, 12);
      const sealed = input.wrappedDek.slice(12);
      return new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: Uint8Array.from(nonce).buffer,
            additionalData: Uint8Array.from(aad(input, input.kekVersion)).buffer,
            tagLength: 128,
          },
          await this.key(input.kekVersion),
          Uint8Array.from(sealed).buffer,
        ),
      );
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'KMS_KEY_VERSION_UNAVAILABLE') throw cause;
      throw error('KMS_UNWRAP_FAILED');
    }
  }
}
