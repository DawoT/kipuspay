import { describe, expect, it, vi } from 'vitest';
import { createBackupR2Port, R2_MULTIPART_MIN_BYTES } from './backup-r2.js';

describe('backup R2 port', () => {
  it('uses a checksum-bearing small put below the multipart threshold', async () => {
    const put = vi
      .fn<
        (
          key: string,
          value: Uint8Array,
          options: { customMetadata: Record<string, string>; sha256: ArrayBuffer },
        ) => Promise<{ etag: string }>
      >()
      .mockResolvedValue({ etag: 'etag-small' });
    const bucket = { put } as never;
    const port = createBackupR2Port(bucket);
    const result = await port.putEncrypted({
      key: 'staging/t/b/chunk-0',
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'a'.repeat(64),
      metadata: { tenant: 't', backup: 'b' },
    });
    expect(result).toEqual({ etag: 'etag-small', multipart: false });
    expect(put.mock.calls[0]?.[0]).toBe('staging/t/b/chunk-0');
    expect(put.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);
    expect(put.mock.calls[0]?.[2].customMetadata).toEqual({ tenant: 't', backup: 'b' });
    expect(put.mock.calls[0]?.[2].sha256).toBeInstanceOf(ArrayBuffer);
  });

  it('uploads multipart with every non-final part at least 5 MiB', async () => {
    const uploadPart = vi.fn().mockResolvedValue({ partNumber: 1, etag: 'part' });
    const complete = vi.fn().mockResolvedValue({ etag: 'etag-large' });
    const createMultipartUpload = vi.fn().mockResolvedValue({
      uploadId: 'upload-1',
      key: 'large',
      uploadPart,
      complete,
      abort: vi.fn(),
    });
    const port = createBackupR2Port({ createMultipartUpload } as never);
    const bytes = new Uint8Array(R2_MULTIPART_MIN_BYTES + 7);
    const result = await port.putEncrypted({
      key: 'large',
      bytes,
      sha256: 'b'.repeat(64),
      metadata: {},
    });
    expect(result).toEqual({ etag: 'etag-large', multipart: true });
    expect(uploadPart.mock.calls[0]?.[1]).toHaveLength(R2_MULTIPART_MIN_BYTES);
    expect(uploadPart.mock.calls[1]?.[1]).toHaveLength(7);
  });

  it('aborts a multipart upload after a partial failure', async () => {
    const abort = vi.fn().mockResolvedValue(undefined);
    const uploadPart = vi
      .fn()
      .mockResolvedValueOnce({ partNumber: 1, etag: 'one' })
      .mockRejectedValueOnce(new Error('partial'));
    const port = createBackupR2Port({
      createMultipartUpload: vi.fn().mockResolvedValue({
        uploadId: 'upload-2',
        key: 'large',
        uploadPart,
        complete: vi.fn(),
        abort,
      }),
    } as never);
    await expect(
      port.putEncrypted({
        key: 'large',
        bytes: new Uint8Array(R2_MULTIPART_MIN_BYTES + 1),
        sha256: 'c'.repeat(64),
        metadata: {},
      }),
    ).rejects.toThrow('partial');
    expect(abort).toHaveBeenCalledOnce();
  });

  it('resumes exact multipart parts without uploading or completing duplicates', async () => {
    const uploadPart = vi.fn().mockResolvedValue({ partNumber: 2, etag: 'part-two' });
    const complete = vi.fn().mockResolvedValue({ etag: 'etag-resumed' });
    const resumeMultipartUpload = vi.fn().mockReturnValue({
      uploadPart,
      complete,
      abort: vi.fn(),
    });
    const port = createBackupR2Port({ resumeMultipartUpload } as never);
    const bytes = new Uint8Array(R2_MULTIPART_MIN_BYTES + 7);
    const firstHash = await crypto.subtle.digest('SHA-256', bytes.slice(0, R2_MULTIPART_MIN_BYTES));
    const result = await port.putEncrypted(
      {
        key: 'large',
        bytes,
        sha256: 'd'.repeat(64),
        metadata: {},
      },
      {
        uploadId: 'upload-existing',
        parts: [
          {
            partNumber: 1,
            etag: 'part-one',
            sha256: Array.from(new Uint8Array(firstHash), (byte) =>
              byte.toString(16).padStart(2, '0'),
            ).join(''),
            size: R2_MULTIPART_MIN_BYTES,
          },
        ],
      },
    );
    expect(resumeMultipartUpload).toHaveBeenCalledWith('large', 'upload-existing');
    expect(uploadPart).toHaveBeenCalledTimes(1);
    expect(uploadPart).toHaveBeenCalledWith(2, expect.any(Uint8Array));
    expect(complete).toHaveBeenCalledWith([
      { partNumber: 1, etag: 'part-one' },
      { partNumber: 2, etag: 'part-two' },
    ]);
    expect(result).toMatchObject({ etag: 'etag-resumed', multipart: true });
  });
});
