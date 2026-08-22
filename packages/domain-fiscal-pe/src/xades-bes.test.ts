import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import {
  assertValidCreditNoteXml,
  buildUblCreditNoteXml,
  type UblCreditNoteInput,
} from './ubl-credit-note.js';
import {
  assertValidDebitNoteXml,
  buildUblDebitNoteXml,
  type UblDebitNoteInput,
} from './ubl-debit-note.js';
import { assertValidFacturaXml, buildUblInvoiceXml, type UblInvoiceInput } from './ubl-invoice.js';
import { hashUblXml } from './ubl-shared.js';
import { canonicalC14n10, canonicalC14n10Subtree, rootNamespaceDeclarations } from './xml-c14n.js';
import { issueSelfSignedX509, parseX509IssuerSerial } from './x509-der.js';
import {
  assertSignedCpeXml,
  base64ToDer,
  derToBase64,
  envelopedDigestOctets,
  fingerprintSha256Hex,
  pemBlockToDer,
  sha256Base64,
  signCpeXml,
  stripEnvelopedSignature,
  verifyCpeXmlSignature,
} from './xades-bes.js';

const RSA_GEN = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
} as const;

async function generateMaterial(signingTime = '2026-08-20T16:00:00.000Z'): Promise<{
  pkcs8: Uint8Array;
  certDer: Uint8Array;
  publicKey: CryptoKey;
  signingTime: string;
}> {
  const pair = await crypto.subtle.generateKey(RSA_GEN, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const certDer = await issueSelfSignedX509({
    privateKeyPkcs8Der: pkcs8,
    spkiDer: spki,
    commonName: 'XAdES Fixture',
    organization: 'KipusPay Test',
    country: 'PE',
    serial: 17,
  });
  return { pkcs8, certDer, publicKey: pair.publicKey, signingTime };
}

const invoice = (): UblInvoiceInput => ({
  ublVersion: '2.1',
  customizationId: '2.0',
  id: 'F001-00000001',
  issueDate: '2026-08-20',
  issueTime: '10:00:00',
  invoiceTypeCode: '01',
  currency: 'PEN',
  issuerRuc: '20612913251',
  issuerName: 'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
  customerDocType: '6',
  customerDocNumber: '20987654321',
  customerName: 'Cliente SAC',
  totalTaxableCents: 1000,
  totalIgvCents: 180,
  totalIcbperCents: 0,
  totalAmountCents: 1180,
  lines: [
    {
      id: 1,
      description: 'Producto A&B',
      quantity: 1,
      unitCode: 'NIU',
      unitPriceCents: 1000,
      igvAffectationCode: '10',
      igvCents: 180,
      lineTotalCents: 1180,
      icbperCents: 0,
    },
  ],
});

const creditNote = (): UblCreditNoteInput => ({
  ublVersion: '2.1',
  customizationId: '2.0',
  id: 'FC01-00000001',
  issueDate: '2026-08-20',
  issueTime: '10:00:00',
  currency: 'PEN',
  issuerRuc: '20612913251',
  issuerName: 'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
  customerDocType: '6',
  customerDocNumber: '20987654321',
  customerName: 'Cliente SAC',
  referencedDocId: 'F001-00000001',
  motiveCode: '01',
  totalTaxableCents: 1000,
  totalIgvCents: 180,
  totalIcbperCents: 0,
  totalAmountCents: 1180,
  lines: [
    {
      id: 1,
      description: 'Producto A&B',
      quantity: 1,
      unitCode: 'NIU',
      igvAffectationCode: '10',
      igvCents: 180,
      lineTotalCents: 1180,
      icbperCents: 0,
    },
  ],
});

const debitNote = (): UblDebitNoteInput => ({
  ...creditNote(),
  id: 'FD01-00000001',
  motiveCode: '02',
  totalTaxableCents: 500,
  totalIgvCents: 90,
  totalAmountCents: 590,
  lines: [
    {
      id: 1,
      description: 'Ajuste',
      quantity: 1,
      unitCode: 'NIU',
      igvAffectationCode: '10',
      igvCents: 90,
      lineTotalCents: 590,
      icbperCents: 0,
    },
  ],
});

describe('assertSignedCpeXml (RED contractual)', () => {
  it('XML UBL sin ds:Signature falla el validador XAdES', () => {
    const xml = buildUblInvoiceXml(invoice());
    expect(() => assertValidFacturaXml(xml)).not.toThrow();
    expect(() => assertSignedCpeXml(xml)).toThrow(/MISSING_XADES_SIGNATURE/);
  });
});

describe('signCpeXml XAdES-BES', () => {
  it('factura: firma verificable contra la clave pública y hash de integridad distinto', async () => {
    const xml = buildUblInvoiceXml(invoice());
    const material = await generateMaterial();
    const signed = await signCpeXml(xml, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    expect(() => assertSignedCpeXml(signed)).not.toThrow();
    expect(() => assertValidFacturaXml(signed)).not.toThrow();
    expect(signed).toContain('<ds:Signature');
    expect(signed).toContain('<xades:QualifyingProperties');
    expect(signed).toContain('ext:UBLExtensions');
    expect(await verifyCpeXmlSignature(signed, material.publicKey)).toBe(true);
    const unsignedHash = await hashUblXml(xml);
    const signedHash = await hashUblXml(signed);
    expect(signedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(signedHash).not.toBe(unsignedHash);
    expect(stripEnvelopedSignature(signed)).not.toContain('<ds:Signature');
  });

  it('SignatureValue cubre C14N inclusive in-context de SignedInfo (SUNAT 2335 Hash values)', async () => {
    const xml = buildUblInvoiceXml(invoice());
    const material = await generateMaterial();
    const signed = await signCpeXml(xml, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    const signedInfo = signed.match(/<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/)?.[0];
    expect(signedInfo).toBeDefined();
    const ancestorNs: Array<readonly [string, string]> = [
      ...rootNamespaceDeclarations(signed),
      ['ds', 'http://www.w3.org/2000/09/xmldsig#'],
      ['xades', 'http://uri.etsi.org/01903/v1.3.2#'],
    ];
    const standalone = canonicalC14n10(signedInfo!);
    const inContext = canonicalC14n10Subtree(signedInfo!, ancestorNs);
    expect(standalone.includes('Invoice-2')).toBe(false);
    expect(inContext).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    const sigB64 = signed.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)?.[1];
    expect(sigB64).toBeDefined();
    const sig = Uint8Array.from(atob(sigB64!), (ch) => ch.charCodeAt(0));
    const verifyOctets = (octets: string) =>
      crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        material.publicKey,
        sig,
        new TextEncoder().encode(octets),
      );
    expect(await verifyOctets(inContext)).toBe(true);
    expect(await verifyOctets(standalone)).toBe(false);
    const propsXml = signed.match(/<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/)?.[0];
    const propsDigest = signed.match(
      /URI="#KipusPaySignedProperties">[\s\S]*?<ds:DigestValue>([^<]+)<\/ds:DigestValue>/,
    )?.[1];
    expect(propsDigest).toBe(await sha256Base64(canonicalC14n10Subtree(propsXml!, ancestorNs)));
    expect(propsDigest).not.toBe(await sha256Base64(canonicalC14n10(propsXml!)));
    expect(signed).toContain('<xades:IssuerSerial>');
    expect(signed).toContain('<ds:X509IssuerName>');
    expect(signed).toContain('<ds:X509SerialNumber>');
    expect(signed).toMatch(/<ds:X509SerialNumber>\d+<\/ds:X509SerialNumber>/);
    const parsed = parseX509IssuerSerial(material.certDer);
    expect(signed).toContain(`<ds:X509IssuerName>${parsed.issuerName}</ds:X509IssuerName>`);
    expect(signed).toContain(`<ds:X509SerialNumber>${parsed.serialDecimal}</ds:X509SerialNumber>`);
  });

  it('el digest URI="" no incluye la declaración XML (SUNAT 2335)', async () => {
    const xml = buildUblInvoiceXml(invoice());
    expect(xml.trimStart().startsWith('<?xml')).toBe(true);
    const material = await generateMaterial();
    const signed = await signCpeXml(xml, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    const octets = envelopedDigestOctets(stripEnvelopedSignature(signed));
    expect(octets.startsWith('<?xml')).toBe(false);
    expect(octets.startsWith('<Invoice xmlns="')).toBe(true);
    expect(octets.includes('xmlns:ext=')).toBe(true);
    expect(octets.includes('xmlns:ds=')).toBe(false);
    const docDigest = signed.match(
      /<ds:Reference URI="">[\s\S]*?<ds:DigestValue>([^<]+)<\/ds:DigestValue>/,
    )?.[1];
    expect(docDigest).toBeDefined();
    expect(await sha256Base64(octets)).toBe(docDigest);
    expect(signed).toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    const propsXml = signed.match(/<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/)?.[0];
    expect(propsXml).toBeDefined();
    const propsDigest = signed.match(
      /URI="#KipusPaySignedProperties">[\s\S]*?<ds:DigestValue>([^<]+)<\/ds:DigestValue>/,
    )?.[1];
    expect(propsDigest).toBe(
      await sha256Base64(
        canonicalC14n10Subtree(propsXml!, [
          ...rootNamespaceDeclarations(signed),
          ['ds', 'http://www.w3.org/2000/09/xmldsig#'],
          ['xades', 'http://uri.etsi.org/01903/v1.3.2#'],
        ]),
      ),
    );
  });

  it('NC y ND: firma verificable', async () => {
    const material = await generateMaterial();
    const nc = buildUblCreditNoteXml(creditNote());
    const nd = buildUblDebitNoteXml(debitNote());
    expect(() => assertValidCreditNoteXml(nc)).not.toThrow();
    expect(() => assertValidDebitNoteXml(nd)).not.toThrow();
    const signedNc = await signCpeXml(nc, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    const signedNd = await signCpeXml(nd, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    expect(await verifyCpeXmlSignature(signedNc, material.publicKey)).toBe(true);
    expect(await verifyCpeXmlSignature(signedNd, material.publicKey)).toBe(true);
    expect(signedNc).toContain('<CreditNote');
    expect(signedNd).toContain('<DebitNote');
  });

  it('tamper del XML invalida la firma', async () => {
    const xml = buildUblInvoiceXml(invoice());
    const material = await generateMaterial();
    const signed = await signCpeXml(xml, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    const tampered = signed.replace('ROSA NEGRA DIGITAL SOLUCIONES S.A.C.', 'TAMPERED EMISOR SAC');
    expect(await verifyCpeXmlSignature(tampered, material.publicKey)).toBe(false);
  });

  it('rechaza re-firmar y PEM incompleto', async () => {
    const xml = buildUblInvoiceXml(invoice());
    const material = await generateMaterial();
    const signed = await signCpeXml(xml, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    await expect(
      signCpeXml(signed, {
        privateKeyPkcs8Der: material.pkcs8,
        certDer: material.certDer,
      }),
    ).rejects.toThrow(/ALREADY_SIGNED/);
    expect(() => pemBlockToDer('not-a-pem', 'CERTIFICATE')).toThrow(/PEM_BLOCK_MISSING/);
    const pem = `-----BEGIN CERTIFICATE-----\n${btoa('abc')}\n-----END CERTIFICATE-----`;
    expect(pemBlockToDer(pem, 'CERTIFICATE').byteLength).toBeGreaterThan(0);
    const fp = await fingerprintSha256Hex(material.certDer);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    const pkPem = `-----BEGIN PRIVATE KEY-----\n${derToBase64(material.pkcs8)}\n-----END PRIVATE KEY-----`;
    expect(pemBlockToDer(pkPem, 'PRIVATE KEY').byteLength).toBe(material.pkcs8.byteLength);
    expect(() => base64ToDer('!!!')).toThrow(/INVALID_BASE64/);
    expect(() => assertSignedCpeXml('<Invoice><ds:Signature></ds:Signature></Invoice>')).toThrow(
      /MISSING_SIGNATURE_VALUE/,
    );
    const bare =
      '<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>';
    const signedBare = await signCpeXml(bare, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
    });
    expect(signedBare).toContain('ds:SignatureValue');
    await expect(
      signCpeXml('<?xml version="1.0"', {
        privateKeyPkcs8Der: material.pkcs8,
        certDer: material.certDer,
      }),
    ).rejects.toThrow();
    expect(() =>
      assertSignedCpeXml(
        '<Invoice><ds:Signature><ds:SignatureValue>x</ds:SignatureValue></ds:Signature></Invoice>',
      ),
    ).toThrow(/MISSING_X509/);
    expect(() =>
      assertSignedCpeXml(
        '<Invoice><ds:Signature><ds:SignatureValue>x</ds:SignatureValue><ds:X509Certificate>y</ds:X509Certificate></ds:Signature></Invoice>',
      ),
    ).toThrow(/MISSING_XADES_PROPS/);
    expect(() =>
      assertSignedCpeXml(
        '<Invoice><ds:Signature><ds:SignatureValue>x</ds:SignatureValue><ds:X509Certificate>y</ds:X509Certificate><xades:QualifyingProperties/></ds:Signature></Invoice>',
      ),
    ).toThrow(/MISSING_DIGEST/);
    const named = xml.replace(
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"',
    );
    const signedNamed = await signCpeXml(named, {
      privateKeyPkcs8Der: material.pkcs8,
      certDer: material.certDer,
      signingTime: material.signingTime,
    });
    expect(await verifyCpeXmlSignature(signedNamed, material.publicKey)).toBe(true);
    const other = await generateMaterial('2026-08-20T16:00:01.000Z');
    expect(await verifyCpeXmlSignature(signed, other.publicKey)).toBe(false);
    await expect(
      verifyCpeXmlSignature(
        '<Invoice><ds:Signature><ds:SignatureValue>QQ==</ds:SignatureValue><ds:X509Certificate>QQ==</ds:X509Certificate><xades:QualifyingProperties/><ds:DigestValue>z</ds:DigestValue></ds:Signature></Invoice>',
        material.publicKey,
      ),
    ).rejects.toThrow(/MISSING_TAG/);
    await expect(
      signCpeXml('<Invoice/>', {
        privateKeyPkcs8Der: material.pkcs8,
        certDer: material.certDer,
      }),
    ).rejects.toThrow(/MALFORMED_XML/);
    await expect(
      signCpeXml(xml, {
        privateKeyPkcs8Der: material.pkcs8,
        certDer: new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]),
      }),
    ).rejects.toThrow(/INVALID_X509/);
  });
});
