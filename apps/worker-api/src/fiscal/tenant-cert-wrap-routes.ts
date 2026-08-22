/**
 * Staff wrapDek del envelope TENANT_CERT (mismo AAD que unwrapDek).
 * PLATFORM_STAFF_TOKEN fail-closed; el DEK no se persiste.
 */
import { bytesFromBase64, bytesToBase64 } from '@kipuspay/domain-fiscal-pe';
import type { WorkerEnv } from '../auth/control-plane.js';

const TENANT_CERT_BACKUP_ID = 'tenant-cert:SUNAT';

function staffAuthorized(env: WorkerEnv, header: string | undefined): boolean {
  const expected = env.PLATFORM_STAFF_TOKEN?.trim() ?? '';
  const provided = (header ?? '').trim();
  if (!expected || !provided || expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

// eslint-disable-next-line complexity -- staff auth + KMS/FISCAL wrap branches
export async function runWrapTenantDekHttp(
  env: WorkerEnv,
  staffToken: string | undefined,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env.PLATFORM_STAFF_TOKEN?.trim()) {
    return { status: 503, body: { error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' } };
  }
  if (!staffAuthorized(env, staffToken)) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
  const dekB64 = typeof body.dekB64 === 'string' ? body.dekB64.trim() : '';
  const backupId =
    typeof body.backupId === 'string' && body.backupId.trim().length > 0
      ? body.backupId.trim()
      : TENANT_CERT_BACKUP_ID;
  if (!tenantId || !dekB64) {
    return { status: 400, body: { error: 'tenantId and dekB64 required', code: 'BAD_REQUEST' } };
  }
  let dek: Uint8Array;
  try {
    dek = bytesFromBase64(dekB64);
  } catch {
    return { status: 400, body: { error: 'dekB64 invalid', code: 'BAD_REQUEST' } };
  }
  if (dek.byteLength !== 32) {
    return { status: 400, body: { error: 'DEK must be 32 bytes', code: 'KMS_DEK_INVALID' } };
  }
  if (env.BACKUP_KMS) {
    const wrapped = await env.BACKUP_KMS.wrapDek({ tenantId, backupId, dek });
    return {
      status: 200,
      body: {
        wrappedDekB64: bytesToBase64(wrapped.wrappedDek),
        kekVersion: wrapped.kekVersion,
        backupId,
      },
    };
  }
  if (!env.FISCAL?.wrapTenantDek) {
    return { status: 503, body: { error: 'KMS unavailable', code: 'MISSING_KMS' } };
  }
  const fiscal = await env.FISCAL.wrapTenantDek({ tenantId, backupId, dek });
  if ('error' in fiscal) {
    return { status: 503, body: { error: fiscal.error, code: 'MISSING_KMS' } };
  }
  return {
    status: 200,
    body: {
      wrappedDekB64: fiscal.wrappedDekB64,
      kekVersion: fiscal.kekVersion,
      backupId,
    },
  };
}
