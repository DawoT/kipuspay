import { WorkerEntrypoint } from 'cloudflare:workers';
import { BackupKmsCore, type KmsEnv, type WrappedDek } from './kms-core.js';

export type { KmsEnv, WrappedDek } from './kms-core.js';

interface DekContext {
  readonly tenantId: string;
  readonly backupId: string;
}

export class BackupKmsService extends WorkerEntrypoint<KmsEnv> {
  activeKeyVersion(): Promise<string> {
    return Promise.resolve(new BackupKmsCore(this.env).activeKeyVersion());
  }

  async wrapDek(input: DekContext & { readonly dek: Uint8Array }): Promise<WrappedDek> {
    return new BackupKmsCore(this.env).wrapDek(input);
  }

  async unwrapDek(input: DekContext & WrappedDek): Promise<Uint8Array> {
    return new BackupKmsCore(this.env).unwrapDek(input);
  }
}

export default BackupKmsService;
