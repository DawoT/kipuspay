/**
 * Carga material TENANT_CERT: D1 solo tiene kms_ref + cert_chain_pem.
 * Unwrap DEK vía KMS y PKCS#8 vía Secrets Store (nunca persiste la privada).
 */
import {
  envelopeBinary,
  openPkcs8WithDek,
  parseTenantCertEnvelope,
  pemBlockToDer,
  signCpeXml,
} from '@kipuspay/domain-fiscal-pe';
import type { D1DatabaseLike } from './index.js';
import type { FiscalXmlSigner } from './fiscal-xml-producer.js';

export interface TenantCertRow {
  readonly alias: string;
  readonly private_key_kms_ref: string;
  readonly cert_chain_pem: string;
}

export interface TenantCertKms {
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

export interface TenantCertSecrets {
  get(ref: string): Promise<string | null>;
}

export async function loadTenantCertificate(
  db: D1DatabaseLike,
  tenantId: string,
  alias = 'SUNAT',
): Promise<TenantCertRow | null> {
  return db
    .prepare(
      `SELECT alias, private_key_kms_ref, cert_chain_pem
       FROM tenant_certificates WHERE tenant_id = ? AND alias = ?`,
    )
    .bind(tenantId, alias)
    .first<TenantCertRow>();
}

export function createTenantCertSigner(input: {
  readonly db: D1DatabaseLike;
  readonly secrets: TenantCertSecrets;
  readonly kms: TenantCertKms;
}): FiscalXmlSigner {
  return {
    async sign(xml, tenantId) {
      const row = await loadTenantCertificate(input.db, tenantId);
      if (!row) throw new Error('MISSING_TENANT_CERT');
      const inline = row.private_key_kms_ref.startsWith('envelope-v1:')
        ? row.private_key_kms_ref.slice('envelope-v1:'.length)
        : null;
      const raw = inline ?? (await input.secrets.get(row.private_key_kms_ref));
      if (!raw) throw new Error('TENANT_CERT_SECRET_UNAVAILABLE');
      const envelope = parseTenantCertEnvelope(raw);
      const parts = envelopeBinary(envelope);
      const dek = await input.kms.unwrapDek({
        tenantId,
        backupId: envelope.backupId,
        wrappedDek: parts.wrappedDek,
        kekVersion: envelope.kekVersion,
      });
      const pkcs8 = await openPkcs8WithDek(dek, parts.nonce, parts.ciphertext);
      const certDer = pemBlockToDer(row.cert_chain_pem, 'CERTIFICATE');
      return signCpeXml(xml, { privateKeyPkcs8Der: pkcs8, certDer });
    },
  };
}
