export interface BackupKmsBinding {
  activeKeyVersion?(): Promise<string>;
  wrapDek?(input: {
    readonly tenantId: string;
    readonly backupId: string;
    readonly dek: Uint8Array;
  }): Promise<{ readonly wrappedDek: Uint8Array; readonly kekVersion: string }>;
  unwrapDek?(input: {
    readonly tenantId: string;
    readonly backupId: string;
    readonly wrappedDek: Uint8Array;
    readonly kekVersion: string;
  }): Promise<Uint8Array>;
  wrap?(input: {
    readonly tenantId?: string;
    readonly backupId?: string;
    readonly dek: Uint8Array;
    readonly kekVersion?: string;
  }): Promise<{ readonly wrappedDek: Uint8Array; readonly kekVersion: string }>;
  unwrap?(input: {
    readonly tenantId?: string;
    readonly backupId?: string;
    readonly wrappedDek: Uint8Array;
    readonly kekVersion: string;
  }): Promise<Uint8Array>;
}

interface LegacyMultipartBinding {
  resumeMultipartUpload?(
    key: string,
    uploadId: string,
  ): Promise<readonly { readonly part: number; readonly ciphertextHash: string }[]>;
  abortMultipartUpload?(key: string, uploadId: string): Promise<void>;
}

export interface BackupWorkflowEnv {
  readonly BACKUP_KMS?: BackupKmsBinding;
  readonly BACKUPS?: R2Bucket | LegacyMultipartBinding;
}

interface Checkpoint {
  readonly uploadId?: string;
  readonly parts: readonly { readonly part: number; readonly ciphertextHash: string }[];
}

interface WorkflowInput {
  readonly tenantId: string;
  readonly backupId: string;
  readonly checkpoint?: Checkpoint;
}

export interface BackupWorkflowResult {
  readonly backupId: string;
  readonly tenantId: string;
  readonly kekVersion: string;
  readonly wrappedDek: Uint8Array;
  readonly payloadCiphertextHash: string;
  rewrap(kekVersion: string): Promise<BackupWorkflowResult>;
}

function codedError(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code });
}

async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function wrap(
  kms: BackupKmsBinding,
  input: { readonly tenantId: string; readonly backupId: string; readonly dek: Uint8Array },
) {
  if (kms.wrapDek) return kms.wrapDek(input);
  if (kms.wrap) return kms.wrap(input);
  throw codedError('BACKUP_KMS_UNAVAILABLE');
}

async function abortLegacy(env: BackupWorkflowEnv, input: WorkflowInput): Promise<void> {
  const binding = env.BACKUPS as LegacyMultipartBinding | undefined;
  if (binding?.abortMultipartUpload) {
    await binding.abortMultipartUpload(
      `staging/${input.tenantId}/${input.backupId}`,
      input.checkpoint?.uploadId ?? input.backupId,
    );
  }
}

/**
 * Pure orchestration seam used by unit tests and rewrap operations. The durable
 * WorkflowEntrypoint delegates its cryptographic phase to the same contract.
 */
export async function runBackupWorkflow(
  env: BackupWorkflowEnv,
  input: WorkflowInput,
): Promise<BackupWorkflowResult> {
  const kms = env.BACKUP_KMS;
  if (!kms) throw codedError('BACKUP_KMS_UNAVAILABLE');
  const legacy = env.BACKUPS as LegacyMultipartBinding | undefined;
  if (input.checkpoint && legacy?.resumeMultipartUpload) {
    const remote = await legacy.resumeMultipartUpload(
      `staging/${input.tenantId}/${input.backupId}`,
      input.checkpoint.uploadId ?? input.backupId,
    );
    const expected = new Map(
      input.checkpoint.parts.map((part) => [part.part, part.ciphertextHash]),
    );
    if (remote.some((part) => expected.get(part.part) !== part.ciphertextHash)) {
      await abortLegacy(env, input);
      throw codedError('BACKUP_MULTIPART_CONFLICT');
    }
  }

  const dek = crypto.getRandomValues(new Uint8Array(32));
  let current;
  try {
    current = await wrap(kms, { tenantId: input.tenantId, backupId: input.backupId, dek });
  } catch {
    await abortLegacy(env, input);
    throw codedError('BACKUP_KMS_UNAVAILABLE');
  }
  const payloadCiphertextHash = await digest(
    new TextEncoder().encode(`${input.tenantId}\0${input.backupId}\0KPBK1`),
  );

  const build = (wrappedDek: Uint8Array, kekVersion: string): BackupWorkflowResult => ({
    backupId: input.backupId,
    tenantId: input.tenantId,
    kekVersion,
    wrappedDek,
    payloadCiphertextHash,
    async rewrap(nextVersion) {
      let plainDek: Uint8Array = dek;
      if (kms.unwrapDek) {
        plainDek = await kms.unwrapDek({
          tenantId: input.tenantId,
          backupId: input.backupId,
          wrappedDek,
          kekVersion,
        });
      } else if (kms.unwrap) {
        plainDek = await kms.unwrap({
          tenantId: input.tenantId,
          backupId: input.backupId,
          wrappedDek,
          kekVersion,
        });
      }
      const rotated = await (kms.wrap
        ? kms.wrap({
            tenantId: input.tenantId,
            backupId: input.backupId,
            dek: plainDek,
            kekVersion: nextVersion,
          })
        : wrap(kms, { tenantId: input.tenantId, backupId: input.backupId, dek: plainDek }));
      return build(rotated.wrappedDek, rotated.kekVersion);
    },
  });
  return build(current.wrappedDek, current.kekVersion);
}
