import { describe, expect, it } from 'vitest';
import { parsePkcs12 } from './pkcs12.js';

function tlv(tag: number, content: Uint8Array): Uint8Array {
  const lenBytes =
    content.length < 0x80 ? Uint8Array.of(content.length) : Uint8Array.of(0x81, content.length);
  const out = new Uint8Array(1 + lenBytes.length + content.length);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(content, 1 + lenBytes.length);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const OID_DATA = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01);
const OID_ENCRYPTED = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x06);
const OID_RC4 = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c, 0x01, 0x01);

function pfx(ci: Uint8Array): Uint8Array {
  const filler = tlv(0x04, new Uint8Array(24).fill(0xab));
  return tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x03)), ci, filler));
}

describe('parsePkcs12 fail-paths BER', () => {
  it('ContentInfo vacío o sin OID', async () => {
    await expect(parsePkcs12(pfx(tlv(0x30, new Uint8Array())), 'x')).rejects.toThrow(/PKCS12_/);
    await expect(parsePkcs12(pfx(tlv(0x30, tlv(0x02, Uint8Array.of(0x01)))), 'x')).rejects.toThrow(
      /PKCS12_/,
    );
  });

  it('ContentInfo solo OID DATA (sin contenido)', async () => {
    await expect(parsePkcs12(pfx(tlv(0x30, tlv(0x06, OID_DATA))), 'x')).rejects.toThrow(/PKCS12_/);
  });

  it('OID de contenido desconocido', async () => {
    const unknown = tlv(0x06, Uint8Array.of(0x2a, 0x03));
    const ci = tlv(0x30, concat(unknown, tlv(0xa0, tlv(0x04, new Uint8Array([1, 2, 3])))));
    await expect(parsePkcs12(pfx(ci), 'x')).rejects.toThrow(/PKCS12_/);
  });

  it('EncryptedData con PBE no soportado (RC4)', async () => {
    const alg = tlv(
      0x30,
      concat(
        tlv(0x06, OID_RC4),
        tlv(0x30, concat(tlv(0x04, Uint8Array.of(1, 2, 3, 4)), tlv(0x02, Uint8Array.of(0x01)))),
      ),
    );
    const eci = tlv(0x30, concat(tlv(0x06, OID_DATA), alg, tlv(0x04, new Uint8Array(8).fill(9))));
    const enc = tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x00)), eci));
    const ci = tlv(0x30, concat(tlv(0x06, OID_ENCRYPTED), tlv(0xa0, enc)));
    await expect(parsePkcs12(pfx(ci), 'x')).rejects.toThrow(/PKCS12_/);
  });

  it('DATA con SafeContents vacío (MISSING_BAGS)', async () => {
    const ci = tlv(
      0x30,
      concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, tlv(0x30, new Uint8Array())))),
    );
    await expect(parsePkcs12(pfx(ci), 'x')).rejects.toThrow(/PKCS12_MISSING_BAGS/);
  });

  it('PBE_PARAMS incompletos y EncryptedData sin versión INTEGER', async () => {
    const oid3des = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c, 0x01, 0x03);
    const algBare = tlv(0x30, tlv(0x06, oid3des));
    const eci = tlv(
      0x30,
      concat(tlv(0x06, OID_DATA), algBare, tlv(0x04, new Uint8Array(8).fill(1))),
    );
    const enc = tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x00)), eci));
    await expect(
      parsePkcs12(pfx(tlv(0x30, concat(tlv(0x06, OID_ENCRYPTED), tlv(0xa0, enc)))), 'x'),
    ).rejects.toThrow(/PKCS12_/);

    const encNoVer = tlv(0x30, eci);
    await expect(
      parsePkcs12(pfx(tlv(0x30, concat(tlv(0x06, OID_ENCRYPTED), tlv(0xa0, encNoVer)))), 'x'),
    ).rejects.toThrow(/PKCS12_/);
  });

  it('PBES2 sin PBKDF2, AES no soportado y cipher tag inválido', async () => {
    const oidPbes2 = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x05, 0x0d);
    const oidPbkdf2 = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x05, 0x0c);
    const oidAes256 = Uint8Array.of(0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x01, 0x2a);
    const kdfNot = tlv(
      0x30,
      concat(
        tlv(0x06, OID_RC4),
        tlv(0x30, concat(tlv(0x04, Uint8Array.of(1, 2, 3, 4)), tlv(0x02, Uint8Array.of(1)))),
      ),
    );
    const encAlg = tlv(0x30, concat(tlv(0x06, oidAes256), tlv(0x04, new Uint8Array(16))));
    const pbes2 = tlv(0x30, concat(tlv(0x06, oidPbes2), tlv(0x30, concat(kdfNot, encAlg))));
    const eci = tlv(
      0x30,
      concat(tlv(0x06, OID_DATA), pbes2, tlv(0x04, new Uint8Array(16).fill(2))),
    );
    const enc = tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x00)), eci));
    await expect(
      parsePkcs12(pfx(tlv(0x30, concat(tlv(0x06, OID_ENCRYPTED), tlv(0xa0, enc)))), 'x'),
    ).rejects.toThrow(/PKCS12_/);

    const kdfOk = tlv(
      0x30,
      concat(
        tlv(0x06, oidPbkdf2),
        tlv(
          0x30,
          concat(tlv(0x04, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8)), tlv(0x02, Uint8Array.of(1))),
        ),
      ),
    );
    const encBad = tlv(0x30, concat(tlv(0x06, OID_RC4), tlv(0x04, new Uint8Array(16))));
    const pbes2badAes = tlv(0x30, concat(tlv(0x06, oidPbes2), tlv(0x30, concat(kdfOk, encBad))));
    const eci2 = tlv(
      0x30,
      concat(tlv(0x06, OID_DATA), pbes2badAes, tlv(0x04, new Uint8Array(16).fill(3))),
    );
    await expect(
      parsePkcs12(
        pfx(
          tlv(
            0x30,
            concat(
              tlv(0x06, OID_ENCRYPTED),
              tlv(0xa0, tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x00)), eci2))),
            ),
          ),
        ),
        'x',
      ),
    ).rejects.toThrow(/PKCS12_/);

    const eciCipher = tlv(0x30, concat(tlv(0x06, OID_DATA), pbes2, tlv(0x02, Uint8Array.of(0x01))));
    await expect(
      parsePkcs12(
        pfx(
          tlv(
            0x30,
            concat(
              tlv(0x06, OID_ENCRYPTED),
              tlv(0xa0, tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x00)), eciCipher))),
            ),
          ),
        ),
        'x',
      ),
    ).rejects.toThrow(/PKCS12_/);

    const eciImplicit = tlv(
      0x30,
      concat(tlv(0x06, OID_DATA), pbes2, tlv(0x80, new Uint8Array(16).fill(4))),
    );
    await expect(
      parsePkcs12(
        pfx(
          tlv(
            0x30,
            concat(
              tlv(0x06, OID_ENCRYPTED),
              tlv(0xa0, tlv(0x30, concat(tlv(0x02, Uint8Array.of(0x00)), eciImplicit))),
            ),
          ),
        ),
        'x',
      ),
    ).rejects.toThrow(/PKCS12_/);
  });

  it('SafeBags sin OID, certBag no-X509, keyBag y UTCTime 1950', async () => {
    const oidKey = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c, 0x0a, 0x01, 0x01);
    const oidCert = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c, 0x0a, 0x01, 0x03);
    const oidX509 = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x16, 0x01);
    const oidCn = Uint8Array.of(0x55, 0x04, 0x03);
    const pkcs8 = tlv(
      0x30,
      concat(
        tlv(0x02, Uint8Array.of(0x00)),
        tlv(
          0x30,
          concat(
            tlv(0x06, Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01)),
            tlv(0x05, new Uint8Array()),
          ),
        ),
        tlv(0x04, new Uint8Array(8).fill(0x11)),
      ),
    );
    const utc = (s: string) => tlv(0x17, new TextEncoder().encode(s));
    const name = tlv(
      0x30,
      tlv(0x31, tlv(0x30, concat(tlv(0x06, oidCn), tlv(0x0c, new TextEncoder().encode('T'))))),
    );
    const validity = tlv(0x30, concat(utc('200101000000Z'), utc('500101000000Z')));
    const tbs = tlv(
      0x30,
      concat(tlv(0x02, Uint8Array.of(0x01)), tlv(0x30, new Uint8Array()), name, validity),
    );
    const cert = tlv(0x30, tbs);
    const keyBag = tlv(0x30, concat(tlv(0x06, oidKey), tlv(0xa0, pkcs8)));
    const certInner = tlv(0x30, concat(tlv(0x06, oidX509), tlv(0xa0, tlv(0x04, cert))));
    const certBag = tlv(0x30, concat(tlv(0x06, oidCert), tlv(0xa0, certInner)));
    const skipInt = tlv(0x02, Uint8Array.of(0x00));
    const bagNoOid = tlv(0x30, tlv(0x02, Uint8Array.of(0x01)));
    const bagOidOnly = tlv(0x30, tlv(0x06, oidKey));
    const otherCert = tlv(
      0x30,
      concat(
        tlv(0x06, oidCert),
        tlv(
          0xa0,
          tlv(0x30, concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, new Uint8Array([1]))))),
        ),
      ),
    );
    const safe = tlv(0x30, concat(skipInt, bagNoOid, bagOidOnly, otherCert, keyBag, certBag));
    const ci = tlv(0x30, concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, safe))));
    const parsed = await parsePkcs12(pfx(ci), 'x');
    expect(parsed.expiresAt.startsWith('1950-')).toBe(true);

    const emptyCert = tlv(0x30, new Uint8Array());
    const badInner = tlv(0x30, concat(tlv(0x06, oidX509), tlv(0xa0, tlv(0x04, emptyCert))));
    const badBag = tlv(0x30, concat(tlv(0x06, oidCert), tlv(0xa0, badInner)));
    const safeBad = tlv(0x30, concat(keyBag, badBag));
    await expect(
      parsePkcs12(pfx(tlv(0x30, concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, safeBad))))), 'x'),
    ).rejects.toThrow();

    const notAfter = tlv(0x17, new TextEncoder().encode('ABCD'));
    const validityBad = tlv(0x30, concat(utc('200101000000Z'), notAfter));
    const tbsBad = tlv(
      0x30,
      concat(tlv(0x02, Uint8Array.of(0x01)), tlv(0x30, new Uint8Array()), name, validityBad),
    );
    const certBad = tlv(0x30, tbsBad);
    const innerBad = tlv(0x30, concat(tlv(0x06, oidX509), tlv(0xa0, tlv(0x04, certBad))));
    const bagBad = tlv(0x30, concat(tlv(0x06, oidCert), tlv(0xa0, innerBad)));
    await expect(
      parsePkcs12(
        pfx(
          tlv(
            0x30,
            concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, tlv(0x30, concat(keyBag, bagBad))))),
          ),
        ),
        'x',
      ),
    ).rejects.toThrow(/PKCS12_/);

    const rawBags = concat(skipInt, keyBag, certBag);
    await expect(
      parsePkcs12(pfx(tlv(0x30, concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, rawBags))))), 'x'),
    ).resolves.toMatchObject({ fingerprintSha256: expect.any(String) });
  });

  it('DATA anidado ContentInfo y shrouded que no abre', async () => {
    const oidKey = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c, 0x0a, 0x01, 0x01);
    const oidCert = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c, 0x0a, 0x01, 0x03);
    const oidX509 = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x16, 0x01);
    const oidCn = Uint8Array.of(0x55, 0x04, 0x03);
    const utc = (s: string) => tlv(0x17, new TextEncoder().encode(s));
    const name = tlv(
      0x30,
      tlv(0x31, tlv(0x30, concat(tlv(0x06, oidCn), tlv(0x0c, new TextEncoder().encode('N'))))),
    );
    const validity = tlv(0x30, concat(utc('200101000000Z'), utc('260101000000Z')));
    const cert = tlv(
      0x30,
      tlv(
        0x30,
        concat(tlv(0x02, Uint8Array.of(0x01)), tlv(0x30, new Uint8Array()), name, validity),
      ),
    );
    const alg = tlv(
      0x30,
      concat(
        tlv(0x06, OID_RC4),
        tlv(0x30, concat(tlv(0x04, Uint8Array.of(1, 2)), tlv(0x02, Uint8Array.of(1)))),
      ),
    );
    const notOctet = tlv(0x02, Uint8Array.of(0x09));
    const fakeShroud = concat(alg, notOctet);
    const keyBag = tlv(0x30, concat(tlv(0x06, oidKey), tlv(0xa0, fakeShroud)));
    const certBag = tlv(
      0x30,
      concat(
        tlv(0x06, oidCert),
        tlv(0xa0, tlv(0x30, concat(tlv(0x06, oidX509), tlv(0xa0, tlv(0x04, cert))))),
      ),
    );
    const innerSafe = tlv(0x30, concat(keyBag, certBag));
    const nestedCi = tlv(0x30, concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, innerSafe))));
    const outer = tlv(0x30, concat(tlv(0x06, OID_DATA), tlv(0xa0, tlv(0x04, nestedCi))));
    const parsed = await parsePkcs12(pfx(outer), 'x');
    expect(parsed.expiresAt.startsWith('2026-')).toBe(true);
  });
});
