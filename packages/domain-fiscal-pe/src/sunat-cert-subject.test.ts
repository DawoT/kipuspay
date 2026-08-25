/**
 * SEC-03 / ADR-FISCAL-006: identidad del certificado SUNAT del tenant.
 * Patrón CDT real: organizationIdentifier con prefijo NTRPE y el RUC, y
 * OU igual al RUC. El CN es libre (razón social) y NUNCA es fuente de
 * identidad.
 */
import { describe, expect, it } from 'vitest';
import {
  issueSelfSignedX509,
  parseX509Subject,
  subjectHasUsoTributario,
  sunatCertRuc,
} from './index.js';

const RUC = '20123456789';

const RSA_GEN = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
} as const;

async function keyPair(): Promise<{ pkcs8: Uint8Array; spki: Uint8Array }> {
  const pair = await crypto.subtle.generateKey(RSA_GEN, true, ['sign', 'verify']);
  return {
    pkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    spki: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)),
  };
}

async function cdtCert(input?: {
  readonly ruc?: string;
  readonly usoTributario?: boolean;
  readonly notAfter?: string;
}): Promise<Uint8Array> {
  const ruc = input?.ruc ?? RUC;
  const organizationalUnits = [ruc, ...(input?.usoTributario === false ? [] : ['USO TRIBUTARIO'])];
  const { pkcs8, spki } = await keyPair();
  return issueSelfSignedX509({
    privateKeyPkcs8Der: pkcs8,
    spkiDer: spki,
    commonName: 'BIZ SAC',
    organization: 'BIZ',
    country: 'PE',
    organizationalUnits,
    organizationIdentifier: `NTRPE-${ruc}`,
    ...(input?.notAfter ? { notAfter: input.notAfter } : {}),
  });
}

describe('parseX509Subject', () => {
  it('expone attrs tipadas (OU múltiple + organizationIdentifier) y RFC 2253', async () => {
    const der = await cdtCert();
    const subject = parseX509Subject(der);
    const keys = subject.attrs.map((a) => a.key);
    expect(keys).toContain('organizationIdentifier');
    expect(keys.filter((k) => k === 'OU')).toHaveLength(2);
    expect(subject.attrs.find((a) => a.key === 'organizationIdentifier')?.value).toBe(
      `NTRPE-${RUC}`,
    );
    expect(subject.rfc2253).toContain(`NTRPE-${RUC}`);
    expect(subject.rfc2253).toContain('USO TRIBUTARIO');
  });

  it('falla tipado si el DER no es un certificado', () => {
    expect(() => parseX509Subject(new Uint8Array([4, 5, 6]))).toThrow(/INVALID_X509/);
  });
});

describe('sunatCertRuc (patrón CDT)', () => {
  it('extrae el RUC de organizationIdentifier «NTRPE-<RUC>»', async () => {
    const subject = parseX509Subject(await cdtCert());
    expect(sunatCertRuc(subject)).toBe(RUC);
  });

  it('cae al OU=<RUC> cuando no hay organizationIdentifier', async () => {
    const { pkcs8, spki } = await keyPair();
    const der = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'BIZ SAC',
      organization: 'BIZ',
      country: 'PE',
      organizationalUnits: [RUC],
    });
    expect(sunatCertRuc(parseX509Subject(der))).toBe(RUC);
  });

  it('ignora el CN libre aunque parezca un RUC (anti-spoofing A4)', async () => {
    const { pkcs8, spki } = await keyPair();
    const der = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: RUC,
      organization: 'BIZ',
      country: 'PE',
      organizationalUnits: ['USO TRIBUTARIO'],
    });
    expect(sunatCertRuc(parseX509Subject(der))).toBeNull();
  });

  it('sin marcador de RUC → null (fail-closed en el route)', async () => {
    const { pkcs8, spki } = await keyPair();
    const der = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'Free CN',
      organization: 'O',
      country: 'PE',
    });
    expect(sunatCertRuc(parseX509Subject(der))).toBeNull();
  });
});

describe('subjectHasUsoTributario', () => {
  it('true con OU=USO TRIBUTARIO', async () => {
    const subject = parseX509Subject(await cdtCert());
    expect(subjectHasUsoTributario(subject)).toBe(true);
  });

  it('false sin el marcador', async () => {
    const subject = parseX509Subject(await cdtCert({ usoTributario: false }));
    expect(subjectHasUsoTributario(subject)).toBe(false);
  });
});
