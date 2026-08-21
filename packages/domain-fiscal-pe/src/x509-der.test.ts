import { describe, expect, it } from 'vitest';
import { extractSpkiFromX509, issueSelfSignedX509, parseX509IssuerSerial } from './x509-der.js';

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

describe('parseX509IssuerSerial', () => {
  it('lee CN/O/C RFC 2253 y serial decimal de un autocertificado', async () => {
    const { pkcs8, spki } = await keyPair();
    const cert = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'XAdES Fixture',
      organization: 'KipusPay Test',
      country: 'PE',
      serial: 17,
    });
    expect(parseX509IssuerSerial(cert)).toEqual({
      issuerName: 'CN=XAdES Fixture,O=KipusPay Test,C=PE',
      serialDecimal: '17',
    });
    expect(extractSpkiFromX509(cert)).toEqual(spki);
  });

  it('escapa , + " en CN y serial 0', async () => {
    const { pkcs8, spki } = await keyPair();
    const cert = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'Foo,Bar+"Baz',
      organization: 'Org',
      country: 'PE',
      serial: 0,
    });
    expect(parseX509IssuerSerial(cert).issuerName).toBe('CN=Foo\\,Bar\\+\\"Baz,O=Org,C=PE');
    expect(parseX509IssuerSerial(cert).serialDecimal).toBe('0');
  });

  it('rechaza DER truncado, no-secuencia y fechas inválidas', async () => {
    expect(() => parseX509IssuerSerial(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]))).toThrow(
      /INVALID_X509/,
    );
    expect(() => parseX509IssuerSerial(new Uint8Array([]))).toThrow(/INVALID_X509/);
    expect(() => parseX509IssuerSerial(new Uint8Array([0x02, 0x01, 0x01]))).toThrow(/INVALID_X509/);
    expect(() => extractSpkiFromX509(new Uint8Array([0x30, 0x00]))).toThrow(/INVALID_X509/);
    expect(() => parseX509IssuerSerial(new Uint8Array([0x30]))).toThrow(/INVALID_X509/);
    expect(() => parseX509IssuerSerial(new Uint8Array([0x30, 0x80]))).toThrow(/INVALID_X509/);
    expect(() => parseX509IssuerSerial(new Uint8Array([0x30, 0x81]))).toThrow(/INVALID_X509/);
    expect(() => parseX509IssuerSerial(new Uint8Array([0x30, 0x05, 0x00]))).toThrow(/INVALID_X509/);
    const { pkcs8, spki } = await keyPair();
    const bmpCert = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'x',
      organization: 'y',
      country: 'PE',
      serial: 1,
    });
    expect(extractSpkiFromX509(bmpCert).byteLength).toBeGreaterThan(20);
    await expect(
      issueSelfSignedX509({
        privateKeyPkcs8Der: pkcs8,
        spkiDer: spki,
        commonName: 'x',
        organization: 'y',
        country: 'PE',
        notBefore: 'nope',
      }),
    ).rejects.toThrow(/INVALID_X509/);
    await expect(
      issueSelfSignedX509({
        privateKeyPkcs8Der: pkcs8,
        spkiDer: spki,
        commonName: 'x',
        organization: 'y',
        country: 'PE',
        serial: -1,
      }),
    ).rejects.toThrow(/INVALID_X509/);
  });

  it('serial grande y OID desconocido no rompen el parseo RFC 2253', async () => {
    const { pkcs8, spki } = await keyPair();
    const cert = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: '#lead space ',
      organization: 'A<B>;C',
      country: 'PE',
      serial: 0x80,
    });
    const parsed = parseX509IssuerSerial(cert);
    expect(parsed.serialDecimal).toBe('128');
    expect(parsed.issuerName).toContain('\\#');
    expect(parsed.issuerName).toContain('\\<');
    expect(parsed.issuerName).toContain('\\>');
    expect(parsed.issuerName).toContain('\\;');
  });

  it('acepta CN largo (DER length 0x81)', async () => {
    const { pkcs8, spki } = await keyPair();
    const commonName = 'N'.repeat(200);
    const cert = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName,
      organization: 'Org',
      country: 'PE',
    });
    expect(parseX509IssuerSerial(cert).issuerName).toContain(commonName);
  });

  it('acepta CN que fuerza DER length 0x82', async () => {
    const { pkcs8, spki } = await keyPair();
    const commonName = 'N'.repeat(300);
    const cert = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName,
      organization: 'Org',
      country: 'PE',
    });
    expect(parseX509IssuerSerial(cert).issuerName).toContain(commonName);
  });

  it('rechaza CN que excede DER length 0x82', async () => {
    const { pkcs8, spki } = await keyPair();
    await expect(
      issueSelfSignedX509({
        privateKeyPkcs8Der: pkcs8,
        spkiDer: spki,
        commonName: 'N'.repeat(70_000),
        organization: 'Org',
        country: 'PE',
      }),
    ).rejects.toThrow(/INVALID_X509/);
  });

  it('parsea BMPString/Printable y rechaza DirectoryString inválido', () => {
    const tlv = (tag: number, content: Uint8Array): Uint8Array => {
      const len =
        content.length < 0x80 ? Uint8Array.of(content.length) : Uint8Array.of(0x81, content.length);
      const out = new Uint8Array(1 + len.length + content.length);
      out[0] = tag;
      out.set(len, 1);
      out.set(content, 1 + len.length);
      return out;
    };
    const oidCn = tlv(0x06, Uint8Array.of(0x55, 0x04, 0x03));
    const wrapCert = (dir: Uint8Array): Uint8Array => {
      const ava = tlv(0x30, Uint8Array.of(...oidCn, ...dir));
      const rdn = tlv(0x31, ava);
      const name = tlv(0x30, rdn);
      const serial = tlv(0x02, Uint8Array.of(0x01));
      const dummy = tlv(0x30, new Uint8Array());
      const tbs = tlv(0x30, Uint8Array.of(...serial, ...dummy, ...name));
      return tlv(0x30, tbs);
    };
    expect(
      parseX509IssuerSerial(wrapCert(tlv(0x1e, Uint8Array.of(0x00, 0x48, 0x00, 0x69)))),
    ).toEqual({
      issuerName: 'CN=Hi',
      serialDecimal: '1',
    });
    expect(parseX509IssuerSerial(wrapCert(tlv(0x13, Uint8Array.of(0x41, 0x42)))).issuerName).toBe(
      'CN=AB',
    );
    expect(parseX509IssuerSerial(wrapCert(tlv(0x16, Uint8Array.of(0x43)))).issuerName).toBe('CN=C');
    expect(parseX509IssuerSerial(wrapCert(tlv(0x14, Uint8Array.of(0x44)))).issuerName).toBe('CN=D');
    expect(() => parseX509IssuerSerial(wrapCert(tlv(0x1e, Uint8Array.of(0x00))))).toThrow(
      /INVALID_X509/,
    );
    expect(() => parseX509IssuerSerial(wrapCert(tlv(0x03, Uint8Array.of(0x00))))).toThrow(
      /INVALID_X509/,
    );
    const badOid = tlv(0x06, Uint8Array.of(0x55, 0x80));
    const ava = tlv(0x30, Uint8Array.of(...badOid, ...tlv(0x13, Uint8Array.of(0x41))));
    const rdn = tlv(0x31, ava);
    const name = tlv(0x30, rdn);
    const serial = tlv(0x02, Uint8Array.of(0x01));
    const dummy = tlv(0x30, new Uint8Array());
    const tbs = tlv(0x30, Uint8Array.of(...serial, ...dummy, ...name));
    expect(() => parseX509IssuerSerial(tlv(0x30, tbs))).toThrow(/INVALID_X509/);
    const oidUnknown = tlv(0x06, Uint8Array.of(0x55, 0x04, 0x63));
    const avaU = tlv(0x30, Uint8Array.of(...oidUnknown, ...tlv(0x13, Uint8Array.of(0x51))));
    const nameU = tlv(0x30, tlv(0x31, avaU));
    const tbsU = tlv(
      0x30,
      Uint8Array.of(...tlv(0x02, Uint8Array.of(0x01)), ...tlv(0x30, new Uint8Array()), ...nameU),
    );
    expect(parseX509IssuerSerial(tlv(0x30, tbsU)).issuerName).toContain('OID.2.5.4.99=Q');
    expect(() => extractSpkiFromX509(tlv(0x30, tbsU))).toThrow(/INVALID_X509/);
    const tbsN = tlv(
      0x30,
      Uint8Array.of(
        ...tlv(0x02, Uint8Array.of(0x01)),
        ...tlv(0x30, new Uint8Array()),
        ...tlv(0x30, tlv(0x30, avaU)),
      ),
    );
    expect(() => parseX509IssuerSerial(tlv(0x30, tbsN))).toThrow(/INVALID_X509/);
    expect(() =>
      parseX509IssuerSerial(
        tlv(
          0x30,
          tlv(
            0x30,
            Uint8Array.of(...tlv(0x02, new Uint8Array()), ...tlv(0x30, new Uint8Array()), ...nameU),
          ),
        ),
      ),
    ).toThrow(/INVALID_X509/);
  });
});
