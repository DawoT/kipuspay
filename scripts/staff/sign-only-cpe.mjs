#!/usr/bin/env node
/**
 * Staff: firma UBL 01/07/08/RC con PKCS#8 + cert PEM.
 * PKCS8_PATH y CERT_PATH obligatorios. Nunca imprime la clave.
 * Correr: node --experimental-strip-types scripts/staff/sign-only-cpe.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

globalThis.crypto ??= webcrypto;

const pkcs8Path = process.env.PKCS8_PATH;
const certPath = process.env.CERT_PATH;
const kind = (process.env.DOC_KIND ?? '01').trim();
const outPath =
  process.env.OUT_XML ??
  (kind === '07'
    ? 'tmp-staff/signed-nc-beta-07.xml'
    : kind === '08'
      ? 'tmp-staff/signed-nd-beta-08.xml'
      : kind === 'RC'
        ? 'tmp-staff/signed-rc-beta.xml'
        : 'tmp-staff/signed-factura-beta-01.xml');
if (!pkcs8Path || !certPath) {
  console.error('PKCS8_PATH and CERT_PATH required');
  process.exit(1);
}

function pemToDer(pem, label) {
  const re = new RegExp(
    `-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`,
  );
  const match = re.exec(pem);
  if (!match?.[1]) throw new Error(`PEM_BLOCK_MISSING:${label}`);
  return Uint8Array.from(Buffer.from(match[1].replace(/\s+/g, ''), 'base64'));
}

const { buildUblInvoiceXml } = await import(
  '../../packages/domain-fiscal-pe/src/ubl-invoice.ts'
);
const { buildUblCreditNoteXml } = await import(
  '../../packages/domain-fiscal-pe/src/ubl-credit-note.ts'
);
const { buildUblDebitNoteXml } = await import(
  '../../packages/domain-fiscal-pe/src/ubl-debit-note.ts'
);
const { buildUblSummaryDocumentsXml, rcSummaryId } = await import(
  '../../packages/domain-fiscal-pe/src/ubl-summary.ts'
);
const { signCpeXml, fingerprintSha256Hex } = await import(
  '../../packages/domain-fiscal-pe/src/xades-bes.ts'
);
const { hashUblXml } = await import('../../packages/domain-fiscal-pe/src/ubl-shared.ts');

const customerDocNumber = process.env.CUSTOMER_RUC ?? '10715001701';
const customerName = process.env.CUSTOMER_NAME ?? 'RECEPTOR PRUEBA SUNAT BETA';
const issuer = {
  issuerRuc: '20612913251',
  issuerName: 'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
  customerDocType: '6',
  customerDocNumber,
  customerName,
  currency: 'PEN',
};

const line = {
  id: 1,
  description: process.env.LINE_DESC ?? 'Homologacion SUNAT beta',
  quantity: 1,
  unitCode: 'NIU',
  igvAffectationCode: '10',
  igvCents: 18,
  lineTotalCents: 118,
  icbperCents: 0,
};

function unsignedXml() {
  if (kind === '01') {
    return buildUblInvoiceXml({
      ublVersion: '2.1',
      customizationId: '2.0',
      id: process.env.CPE_ID ?? 'F001-00000001',
      issueDate: process.env.ISSUE_DATE ?? '2026-08-21',
      issueTime: process.env.ISSUE_TIME ?? '12:00:00',
      invoiceTypeCode: '01',
      ...issuer,
      totalTaxableCents: 100,
      totalIgvCents: 18,
      totalIcbperCents: 0,
      totalAmountCents: 118,
      lines: [{ ...line, unitPriceCents: 118 }],
    });
  }
  if (kind === '07') {
    return buildUblCreditNoteXml({
      ublVersion: '2.1',
      customizationId: '2.0',
      id: process.env.CPE_ID ?? 'FC01-00000001',
      issueDate: process.env.ISSUE_DATE ?? '2026-08-21',
      issueTime: process.env.ISSUE_TIME ?? '13:00:00',
      ...issuer,
      referencedDocId: process.env.REF_ID ?? 'F001-00000001',
      motiveCode: '01',
      totalTaxableCents: -100,
      totalIgvCents: -18,
      totalIcbperCents: 0,
      totalAmountCents: -118,
      lines: [
        {
          ...line,
          description: 'NC homologacion SUNAT beta',
          igvCents: -18,
          lineTotalCents: -118,
        },
      ],
    });
  }
  if (kind === '08') {
    return buildUblDebitNoteXml({
      ublVersion: '2.1',
      customizationId: '2.0',
      id: process.env.CPE_ID ?? 'FD01-00000001',
      issueDate: process.env.ISSUE_DATE ?? '2026-08-21',
      issueTime: process.env.ISSUE_TIME ?? '13:10:00',
      ...issuer,
      referencedDocId: process.env.REF_ID ?? 'F001-00000001',
      motiveCode: '01',
      totalTaxableCents: 100,
      totalIgvCents: 18,
      totalIcbperCents: 0,
      totalAmountCents: 118,
      lines: [{ ...line, description: 'ND homologacion SUNAT beta' }],
    });
  }
  if (kind === 'RC') {
    const date = process.env.ISSUE_DATE ?? '2026-08-21';
    return buildUblSummaryDocumentsXml({
      id: rcSummaryId(date, Number.parseInt(process.env.RC_CORR ?? '1', 10) || 1),
      referenceDate: date,
      issueDate: date,
      issuerRuc: issuer.issuerRuc,
      issuerName: issuer.issuerName,
      lines: [
        {
          lineId: 1,
          documentType: '03',
          documentId: process.env.CPE_ID ?? 'B001-00000001',
          customerDocType: '6',
          customerDocNumber,
          conditionCode: '1',
          totalTaxableCents: 100,
          totalIgvCents: 18,
          totalAmountCents: 118,
        },
      ],
    });
  }
  throw new Error(`UNSUPPORTED_DOC_KIND:${kind}`);
}

const xml = unsignedXml();
const pkcs8 = pemToDer(readFileSync(pkcs8Path, 'utf8'), 'PRIVATE KEY');
const certDer = pemToDer(readFileSync(certPath, 'utf8'), 'CERTIFICATE');
const signed = await signCpeXml(xml, { privateKeyPkcs8Der: pkcs8, certDer });
mkdirSync('tmp-staff', { recursive: true });
writeFileSync(outPath, signed);
const hash = await hashUblXml(signed);
const fp = await fingerprintSha256Hex(certDer);
process.stdout.write(
  `${JSON.stringify({ kind, outPath, hasSignature: signed.includes('<ds:Signature'), hash, fingerprint: fp }, null, 2)}\n`,
);
