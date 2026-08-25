/**
 * Upload .p12/.pfx del dueño: parse en Worker, wrapDek KMS, D1 solo
 * fingerprint + chain + envelope cifrado (SEC-03 / ADR-FISCAL-006).
 */
import {
  bytesToBase64,
  parsePkcs12,
  parseX509Subject,
  randomDek,
  sealPkcs8WithDek,
  serializeTenantCertEnvelope,
  subjectHasUsoTributario,
  sunatCertRuc,
} from '@kipuspay/domain-fiscal-pe';
import type { WorkerEnv } from '../auth/control-plane.js';

const TENANT_CERT_BACKUP_ID = 'tenant-cert:SUNAT';
const MAX_P12_BYTES = 48 * 1024;

function ownerOrAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

interface CertRejection {
  readonly status: 400;
  readonly body: { error: string; code: string };
}

/**
 * SEC-03 fail-closed (A1..A3): identidad y vigencia del p12 contra el RUC
 * registrado del tenant. El RUC sale SOLO de marcadores estructurados del
 * subject (organizationIdentifier «NTRPE-<RUC>» / OU), nunca del CN libre.
 * Orden determinista: identidad → vigencia → uso tributario.
 */
function validateCertIdentity(
  parsed: { readonly certDer: Uint8Array; readonly expiresAt: string },
  registeredRuc: string,
): CertRejection | null {
  const subject = parseX509Subject(parsed.certDer);
  const certRuc = sunatCertRuc(subject);
  if (!certRuc || certRuc !== registeredRuc) {
    return {
      status: 400,
      body: {
        error: 'Certificate RUC does not match this business',
        code: 'CERT_RUC_MISMATCH',
      },
    };
  }
  if (Date.parse(parsed.expiresAt) <= Date.now()) {
    return { status: 400, body: { error: 'Certificate expired', code: 'CERT_EXPIRED' } };
  }
  if (!subjectHasUsoTributario(subject)) {
    return {
      status: 400,
      body: { error: 'Certificate is not USO TRIBUTARIO', code: 'CERT_USO_INVALIDO' },
    };
  }
  return null;
}

export async function runGetTenantCertHttp(
  env: WorkerEnv,
  tenantId: string,
  role: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!ownerOrAdmin(role)) {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
  }
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const row = await env.DB.prepare(
    `SELECT alias, fingerprint_sha256, expires_at, rotated_at
     FROM tenant_certificates WHERE tenant_id = ? AND alias = 'SUNAT'`,
  )
    .bind(tenantId)
    .first<{
      alias: string;
      fingerprint_sha256: string;
      expires_at: string;
      rotated_at: string | null;
    }>();
  if (!row) {
    return { status: 200, body: { uploaded: false } };
  }
  return {
    status: 200,
    body: {
      uploaded: true,
      alias: row.alias,
      fingerprintSha256: row.fingerprint_sha256,
      expiresAt: row.expires_at,
      rotatedAt: row.rotated_at,
    },
  };
}

// eslint-disable-next-line complexity -- cadena lineal de guardas fail-closed (auth, límites, parseo, identidad SEC-03); partiría la secuencia de rechazo
export async function runUploadTenantCertHttp(
  env: WorkerEnv,
  tenantId: string,
  role: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!ownerOrAdmin(role)) {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
  }
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!env.BACKUP_KMS?.wrapDek) {
    return { status: 503, body: { error: 'KMS unavailable', code: 'MISSING_KMS' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const p12B64 = typeof body.p12B64 === 'string' ? body.p12B64.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!p12B64 || !password) {
    return { status: 400, body: { error: 'p12B64 and password required', code: 'BAD_REQUEST' } };
  }
  let p12: Uint8Array;
  try {
    p12 = Uint8Array.from(atob(p12B64), (ch) => ch.charCodeAt(0));
  } catch {
    return { status: 400, body: { error: 'p12B64 invalid', code: 'BAD_REQUEST' } };
  }
  if (p12.byteLength < 32 || p12.byteLength > MAX_P12_BYTES) {
    return { status: 400, body: { error: 'p12 size', code: 'P12_SIZE' } };
  }
  let parsed;
  try {
    parsed = await parsePkcs12(p12, password);
  } catch {
    return { status: 400, body: { error: 'Could not open certificate', code: 'PKCS12_INVALID' } };
  }
  // SEC-03 fail-closed: identidad y vigencia ANTES de KMS/D1 — un
  // certificado rechazado no consume wrapDek ni muta estado.
  const tenantRow = await env.DB.prepare(`SELECT ruc FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<{ ruc: string | null }>();
  const registeredRuc = tenantRow?.ruc?.trim() ?? '';
  if (!registeredRuc) {
    return {
      status: 400,
      body: { error: 'Tenant has no registered RUC', code: 'CERT_TENANT_NO_RUC' },
    };
  }
  const rejection = validateCertIdentity(parsed, registeredRuc);
  if (rejection) return rejection;
  const dek = randomDek();
  const sealed = await sealPkcs8WithDek(dek, parsed.pkcs8Der);
  const wrapped = await env.BACKUP_KMS.wrapDek({
    tenantId,
    backupId: TENANT_CERT_BACKUP_ID,
    dek,
  });
  const envelope = serializeTenantCertEnvelope({
    kekVersion: wrapped.kekVersion,
    backupId: TENANT_CERT_BACKUP_ID,
    wrappedDekB64: bytesToBase64(wrapped.wrappedDek),
    nonceB64: bytesToBase64(sealed.nonce),
    ciphertextB64: bytesToBase64(sealed.ciphertext),
  });
  const kmsRef = `envelope-v1:${envelope}`;
  const existing = await env.DB.prepare(
    `SELECT id FROM tenant_certificates WHERE tenant_id = ? AND alias = 'SUNAT'`,
  )
    .bind(tenantId)
    .first<{ id: string }>();
  if (existing) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenant_certificates
         SET private_key_kms_ref = ?, cert_chain_pem = ?, fingerprint_sha256 = ?,
             expires_at = ?, rotated_at = datetime('now')
         WHERE tenant_id = ? AND id = ?`,
      ).bind(
        kmsRef,
        parsed.certChainPem,
        parsed.fingerprintSha256,
        parsed.expiresAt.replace('T', ' ').slice(0, 19),
        tenantId,
        existing.id,
      ),
      env.DB.prepare(`UPDATE tenants SET sunat_certificate_status = 'ACTIVE' WHERE id = ?`).bind(
        tenantId,
      ),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenant_certificates (
           id, tenant_id, alias, private_key_kms_ref, cert_chain_pem,
           fingerprint_sha256, expires_at
         ) VALUES (?, ?, 'SUNAT', ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        tenantId,
        kmsRef,
        parsed.certChainPem,
        parsed.fingerprintSha256,
        parsed.expiresAt.replace('T', ' ').slice(0, 19),
      ),
      env.DB.prepare(`UPDATE tenants SET sunat_certificate_status = 'ACTIVE' WHERE id = ?`).bind(
        tenantId,
      ),
    ]);
  }
  return {
    status: 200,
    body: {
      uploaded: true,
      alias: 'SUNAT',
      fingerprintSha256: parsed.fingerprintSha256,
      expiresAt: parsed.expiresAt,
    },
  };
}
