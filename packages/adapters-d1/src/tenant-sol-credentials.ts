/**
 * Credenciales SOL SUNAT por tenant (emisión directa por negocio).
 * Patrón tenant-cert-signer: D1 solo guarda 'envelope-v1:{json}' (AES-GCM);
 * la DEK se desenvuelve vía KMS y el plaintext {"solUser","solPassword"}
 * jamás se persiste. Arquitectura §5.4 / SEC-03 / migración 0061.
 */
import {
  envelopeBinary,
  openPkcs8WithDek,
  parseTenantCertEnvelope,
} from '@kipuspay/domain-fiscal-pe';

/** backupId canónico del envelope SOL de tenant (wrap KMS). */
export const TENANT_SOL_BACKUP_ID = 'tenant-sol:SUNAT';
const ENVELOPE_PREFIX = 'envelope-v1:';

/** Interfaz estructural mínima de lectura (D1DatabaseLike la satisface). */
export interface TenantSolDb {
  prepare(sql: string): {
    bind(...params: unknown[]): { first<T>(): Promise<T | null> };
  };
}

/** KMS mínimo para envelope (TenantCertKms/BACKUP_KMS lo satisfacen). */
export interface TenantSolKms {
  /** Solo provisioning (worker-api /v1/fiscal/tenant-cert/wrap análogo). */
  wrapDek?(input: {
    readonly tenantId: string;
    readonly backupId: string;
    readonly dek: Uint8Array;
  }): Promise<{ readonly wrappedDek: Uint8Array; readonly kekVersion: string }>;
  unwrapDek(input: {
    readonly tenantId: string;
    readonly backupId: string;
    readonly wrappedDek: Uint8Array;
    readonly kekVersion: string;
  }): Promise<Uint8Array>;
}

export interface TenantSolCredentialsRow {
  readonly alias: string;
  readonly sol_credentials_envelope: string;
}

export interface TenantSolCredentials {
  readonly user: string;
  readonly password: string;
}

interface SolPayload {
  readonly solUser?: unknown;
  readonly solPassword?: unknown;
}

function parseSolPayload(plaintext: Uint8Array): TenantSolCredentials {
  let parsed: SolPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext)) as SolPayload;
  } catch {
    throw new Error('TENANT_SOL_PAYLOAD_INVALID');
  }
  const user = typeof parsed.solUser === 'string' ? parsed.solUser.trim() : '';
  const password = typeof parsed.solPassword === 'string' ? parsed.solPassword : '';
  if (!user || !password) throw new Error('TENANT_SOL_PAYLOAD_INVALID');
  return { user, password };
}

/**
 * Carga y desenvelopa las credenciales SOL del tenant.
 * - Sin fila → null: fallback legítimo al env del worker (tenant no migrado).
 * - Fila corrupta / KMS falla → throw tipado: NUNCA credenciales parciales ni
 *   fallback silencioso que pudiera emitir con el SOL de otro emisor.
 */
export async function loadTenantSolCredentials(
  db: TenantSolDb,
  kms: TenantSolKms,
  tenantId: string,
  alias = 'SUNAT',
): Promise<TenantSolCredentials | null> {
  const row = await db
    .prepare(
      `SELECT alias, sol_credentials_envelope
       FROM tenant_sol_credentials WHERE tenant_id = ? AND alias = ?`,
    )
    .bind(tenantId, alias)
    .first<TenantSolCredentialsRow>();
  if (!row) return null;
  const raw = row.sol_credentials_envelope;
  const inline = raw.startsWith(ENVELOPE_PREFIX) ? raw.slice(ENVELOPE_PREFIX.length) : raw;
  const envelope = parseTenantCertEnvelope(inline);
  const parts = envelopeBinary(envelope);
  const dek = await kms.unwrapDek({
    tenantId,
    backupId: envelope.backupId,
    wrappedDek: parts.wrappedDek,
    kekVersion: envelope.kekVersion,
  });
  const plaintext = await openPkcs8WithDek(dek, parts.nonce, parts.ciphertext);
  return parseSolPayload(plaintext);
}
