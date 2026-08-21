import { describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  buildUblInvoiceXml,
  randomDek,
  sealPkcs8WithDek,
  serializeTenantCertEnvelope,
  signCpeXml,
  issueSelfSignedX509,
  verifyCpeXmlSignature,
  type UblInvoiceInput,
} from '@kipuspay/domain-fiscal-pe';
import type { D1DatabaseLike } from './index.js';
import { createTenantCertSigner } from './tenant-cert-signer.js';

const sampleInvoice = (): UblInvoiceInput => ({
  ublVersion: '2.1',
  customizationId: '2.0',
  id: 'F001-00000009',
  issueDate: '2026-08-20',
  issueTime: '11:00:00',
  invoiceTypeCode: '01',
  currency: 'PEN',
  issuerRuc: '20612913251',
  issuerName: 'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
  customerDocType: '6',
  customerDocNumber: '20100070970',
  customerName: 'SUNAT',
  totalTaxableCents: 100,
  totalIgvCents: 18,
  totalIcbperCents: 0,
  totalAmountCents: 118,
  lines: [
    {
      id: 1,
      description: 'Pilot',
      quantity: 1,
      unitCode: 'NIU',
      unitPriceCents: 100,
      igvAffectationCode: '10',
      igvCents: 18,
      lineTotalCents: 118,
      icbperCents: 0,
    },
  ],
});

function memoryCertDb(
  row: {
    alias: string;
    private_key_kms_ref: string;
    cert_chain_pem: string;
  } | null,
): D1DatabaseLike {
  return {
    prepare(sql: string) {
      return {
        bind: (...params: unknown[]) => {
          void params;
          return {
            first: () => {
              if (sql.includes('FROM tenant_certificates')) return Promise.resolve(row);
              return Promise.resolve(null);
            },
            all: () => Promise.resolve({ results: [], success: true, meta: {} }),
            run: () => Promise.resolve({ results: [], success: true, meta: {} }),
          };
        },
      };
    },
    batch: () => Promise.resolve([]),
  } as unknown as D1DatabaseLike;
}

describe('createTenantCertSigner', () => {
  it('unwrap KMS + PEM → XML firmado verificable; sin fila → MISSING_TENANT_CERT', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const certDer = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'Signer Fixture',
      organization: 'KipusPay Test',
      country: 'PE',
    });
    const dek = randomDek();
    const sealed = await sealPkcs8WithDek(dek, pkcs8);
    const envelope = serializeTenantCertEnvelope({
      kekVersion: 'v1',
      backupId: 'tenant-cert:SUNAT',
      wrappedDekB64: bytesToBase64(new Uint8Array(60).fill(7)),
      nonceB64: bytesToBase64(sealed.nonce),
      ciphertextB64: bytesToBase64(sealed.ciphertext),
    });
    const certPem = `-----BEGIN CERTIFICATE-----\n${bytesToBase64(certDer)}\n-----END CERTIFICATE-----`;
    const signer = createTenantCertSigner({
      db: memoryCertDb({
        alias: 'SUNAT',
        private_key_kms_ref: 'secret:TENANT_CERT_ENVELOPE',
        cert_chain_pem: certPem,
      }),
      secrets: {
        get: (ref) => Promise.resolve(ref === 'secret:TENANT_CERT_ENVELOPE' ? envelope : null),
      },
      kms: {
        unwrapDek: () => Promise.resolve(dek),
      },
    });
    const xml = buildUblInvoiceXml(sampleInvoice());
    const signed = await signer.sign(xml, 'tenant_stg_rosa_negra_001');
    expect(signed).toContain('<ds:Signature');
    expect(await verifyCpeXmlSignature(signed, pair.publicKey)).toBe(true);

    const missing = createTenantCertSigner({
      db: memoryCertDb(null),
      secrets: { get: () => Promise.resolve(null) },
      kms: { unwrapDek: () => Promise.resolve(dek) },
    });
    await expect(missing.sign(xml, 't1')).rejects.toThrow(/MISSING_TENANT_CERT/);

    const noSecret = createTenantCertSigner({
      db: memoryCertDb({
        alias: 'SUNAT',
        private_key_kms_ref: 'secret:TENANT_CERT_ENVELOPE',
        cert_chain_pem: certPem,
      }),
      secrets: { get: () => Promise.resolve(null) },
      kms: { unwrapDek: () => Promise.resolve(dek) },
    });
    await expect(noSecret.sign(xml, 'tenant_stg_rosa_negra_001')).rejects.toThrow(
      /TENANT_CERT_SECRET_UNAVAILABLE/,
    );
  });

  it('signCpeXml directo cubre el puerto de dominio', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const certDer = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'Signer Fixture',
      organization: 'KipusPay Test',
      country: 'PE',
    });
    const signed = await signCpeXml(buildUblInvoiceXml(sampleInvoice()), {
      privateKeyPkcs8Der: pkcs8,
      certDer,
      signingTime: '2026-08-20T16:00:00.000Z',
    });
    expect(await verifyCpeXmlSignature(signed, pair.publicKey)).toBe(true);
  });
});
