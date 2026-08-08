export const R2_MULTIPART_MIN_BYTES = 5 * 1024 * 1024;

export interface BackupR2PutInput {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly onCheckpoint?: (checkpoint: BackupMultipartCheckpoint) => Promise<void>;
}

export interface BackupMultipartCheckpoint {
  readonly uploadId: string;
  readonly parts: readonly {
    readonly partNumber: number;
    readonly etag: string;
    readonly sha256: string;
    readonly size: number;
  }[];
}

export interface BackupR2Port {
  putEncrypted(
    input: BackupR2PutInput,
    checkpoint?: BackupMultipartCheckpoint,
  ): Promise<{ readonly etag: string; readonly multipart: boolean }>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
  listPartials(prefix: string, cursor?: string): Promise<R2Objects>;
  abort(key: string, uploadId: string): Promise<void>;
}

function hexToBuffer(value: string): ArrayBuffer {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('BACKUP_CHECKSUM_INVALID');
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)).buffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function createBackupR2Port(bucket: R2Bucket): BackupR2Port {
  return {
    async putEncrypted(input, checkpoint) {
      if (input.bytes.byteLength < R2_MULTIPART_MIN_BYTES) {
        const object = await bucket.put(input.key, input.bytes, {
          sha256: hexToBuffer(input.sha256),
          customMetadata: { ...input.metadata },
        });
        if (!object) throw new Error('BACKUP_R2_PUT_FAILED');
        return { etag: object.etag, multipart: false };
      }

      const upload = checkpoint
        ? bucket.resumeMultipartUpload(input.key, checkpoint.uploadId)
        : await bucket.createMultipartUpload(input.key, {
            customMetadata: { ...input.metadata, sha256: input.sha256 },
          });
      try {
        const parts: R2UploadedPart[] = [];
        const persisted = [...(checkpoint?.parts ?? [])];
        let partNumber = 1;
        for (let offset = 0; offset < input.bytes.byteLength; offset += R2_MULTIPART_MIN_BYTES) {
          const end = Math.min(offset + R2_MULTIPART_MIN_BYTES, input.bytes.byteLength);
          const partBytes = input.bytes.slice(offset, end);
          const partHash = await sha256(partBytes);
          const existing = persisted.find((part) => part.partNumber === partNumber);
          if (existing) {
            if (existing.sha256 !== partHash || existing.size !== partBytes.byteLength) {
              await upload.abort();
              throw new Error('BACKUP_MULTIPART_CONFLICT');
            }
            parts.push({ partNumber: existing.partNumber, etag: existing.etag });
          } else {
            const uploaded = await upload.uploadPart(partNumber, partBytes);
            parts.push(uploaded);
            persisted.push({
              partNumber,
              etag: uploaded.etag,
              sha256: partHash,
              size: partBytes.byteLength,
            });
            await input.onCheckpoint?.({ uploadId: upload.uploadId, parts: [...persisted] });
          }
          partNumber += 1;
        }
        const object = await upload.complete(parts);
        return { etag: object.etag, multipart: true };
      } catch (error) {
        await upload.abort();
        throw error;
      }
    },
    get: (key) => bucket.get(key),
    head: (key) => bucket.head(key),
    delete: (key) => bucket.delete(key),
    listPartials: (prefix, cursor) =>
      bucket.list({
        prefix,
        ...(cursor === undefined ? {} : { cursor }),
        include: ['customMetadata'],
      }),
    async abort(key, uploadId) {
      await bucket.resumeMultipartUpload(key, uploadId).abort();
    },
  };
}
