import { WorkerEntrypoint } from 'cloudflare:workers';
import { BackupKmsCore, type KmsEnv, type WrappedDek } from './kms-core.js';
import {
  sendFcmHttpV1,
  sendWebPushVapid,
  type PushTransportDependencies,
  type PushTransportSecrets,
} from './mobile-push-transport.js';
import {
  PushKmsCore,
  type PushEncryptedEnvelope,
  type PushEnvelopeContext,
  type PushKmsEnv,
} from './push-kms-core.js';
import {
  issuePushAckReceipt,
  verifyPushAckReceipt,
  type PushAckClaims,
} from './mobile-push-receipt.js';

export type { KmsEnv, WrappedDek } from './kms-core.js';
export type { PushEncryptedEnvelope, PushEnvelopeContext, PushKmsEnv } from './push-kms-core.js';

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

interface PushTransportEnv extends PushKmsEnv {
  readonly PUSH_VAPID_PRIVATE_KEY_REF: string;
  readonly PUSH_VAPID_PUBLIC_KEY_REF: string;
  readonly PUSH_VAPID_SUBJECT_REF: string;
  readonly PUSH_FCM_SERVICE_ACCOUNT_REF: string;
  readonly PUSH_VAPID_PRIVATE_KEY?: { get(): Promise<string> };
  readonly PUSH_VAPID_PUBLIC_KEY?: { get(): Promise<string> };
  readonly PUSH_VAPID_SUBJECT?: { get(): Promise<string> };
  readonly PUSH_FCM_SERVICE_ACCOUNT?: { get(): Promise<string> };
  readonly PUSH_ACK_HMAC?: { get(): Promise<string> };
}

/** Private service-binding entrypoint; intentionally has no fetch method. */
export class PushTransportService extends WorkerEntrypoint<PushTransportEnv> {
  private core(): PushKmsCore {
    return new PushKmsCore(this.env);
  }

  private async secret(reference: string): Promise<string> {
    const binding =
      reference === this.env.PUSH_VAPID_PRIVATE_KEY_REF
        ? this.env.PUSH_VAPID_PRIVATE_KEY
        : reference === this.env.PUSH_VAPID_PUBLIC_KEY_REF
          ? this.env.PUSH_VAPID_PUBLIC_KEY
          : reference === this.env.PUSH_VAPID_SUBJECT_REF
            ? this.env.PUSH_VAPID_SUBJECT
            : reference === this.env.PUSH_FCM_SERVICE_ACCOUNT_REF
              ? this.env.PUSH_FCM_SERVICE_ACCOUNT
              : undefined;
    if (!binding) throw new Error('PUSH_SECRET_REFERENCE_INVALID');
    return binding.get();
  }

  private dependencies(): PushTransportDependencies {
    const core = this.core();
    return {
      kms: core,
      secret: (reference) => this.secret(reference),
      fetch,
      now: Date.now,
    };
  }

  encryptEnvelope(
    input: PushEnvelopeContext & { readonly plaintext: string },
  ): Promise<PushEncryptedEnvelope> {
    return this.core().encrypt(input, input.plaintext);
  }

  decryptEnvelope(
    input: PushEnvelopeContext & { readonly ciphertext: string; readonly keyVersion: string },
  ): Promise<string> {
    return this.core().decrypt(input);
  }

  rotateEnvelope(
    input: PushEnvelopeContext & { readonly ciphertext: string; readonly keyVersion: string },
  ): Promise<PushEncryptedEnvelope> {
    return this.core().rotate(input);
  }

  async issueAckReceipt(input: Omit<PushAckClaims, 'nonce'>): Promise<{
    readonly token: string;
    readonly receiptHash: string;
    readonly keyVersion: 'push-ack-v1';
  }> {
    if (!this.env.PUSH_ACK_HMAC) throw new Error('PUSH_ACK_KEY_UNAVAILABLE');
    return issuePushAckReceipt(await this.env.PUSH_ACK_HMAC.get(), input);
  }

  async verifyAckReceipt(input: {
    readonly token: string;
    readonly nowSeconds: number;
  }): Promise<PushAckClaims> {
    if (!this.env.PUSH_ACK_HMAC) throw new Error('PUSH_ACK_KEY_UNAVAILABLE');
    return verifyPushAckReceipt(await this.env.PUSH_ACK_HMAC.get(), input.token, input.nowSeconds);
  }

  sendWebPush(
    input: Omit<Parameters<typeof sendWebPushVapid>[0], 'dependencies' | 'secrets'> & {
      readonly secrets: PushTransportSecrets;
    },
  ): ReturnType<typeof sendWebPushVapid> {
    return sendWebPushVapid({ ...input, dependencies: this.dependencies() });
  }

  sendFcm(
    input: Omit<Parameters<typeof sendFcmHttpV1>[0], 'dependencies' | 'secrets'> & {
      readonly secrets: PushTransportSecrets;
    },
  ): ReturnType<typeof sendFcmHttpV1> {
    return sendFcmHttpV1({ ...input, dependencies: this.dependencies() });
  }
}

export default BackupKmsService;
