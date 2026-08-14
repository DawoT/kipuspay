const SAFE_BACKUP_ERROR_CODES = new Set([
  'BACKUP_AAD_MISMATCH',
  'BACKUP_CHUNK_MISSING',
  'BACKUP_CHUNK_TAMPERED',
  'BACKUP_EPOCH_DRIFT',
  'BACKUP_EPOCH_UNAVAILABLE',
  'BACKUP_EXPORT_COUNT_MISMATCH',
  'BACKUP_HASH_INVALID',
  'BACKUP_KMS_UNAVAILABLE',
  'BACKUP_MANIFEST_PUBLISH_FAILED',
  'BACKUP_MANIFEST_VERIFY_FAILED',
  'BACKUP_MULTIPART_CHECKPOINT_INVALID',
  'BACKUP_MULTIPART_CONFLICT',
  'BACKUP_R2_ETAG_DRIFT',
  'BACKUP_ROW_EXCEEDS_CHUNK_LIMIT',
  'BACKUP_SOURCE_OBJECT_CHANGED',
  'BACKUP_SOURCE_OBJECT_MISSING',
]);

export function safeBackupErrorCode(cause: unknown): string {
  const candidate =
    cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : '';
  return SAFE_BACKUP_ERROR_CODES.has(candidate) ? candidate : 'BACKUP_EXPORT_FAILED';
}
