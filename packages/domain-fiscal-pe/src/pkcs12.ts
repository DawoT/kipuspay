/**
 * Parse PKCS#12 (PFX) mínimo para CDT SUNAT: keyBag / shroudedKeyBag + certBag.
 * Soporta pbeWithSHAAnd3-KeyTripleDES-CBC, pbeWithSHAAnd40BitRC2-CBC y PBES2 AES.
 * Arquitectura §5.4 / invariante 10: corre en Worker, no en el POS.
 */
import {
  childrenOf,
  decodeInteger,
  decodeOid,
  derToPem,
  readBer,
  unwrapOctet,
  unwrapSequence,
  type BerNode,
} from './pkcs12-ber.js';
import { encodePkcs12Password, pkcs12Kdf } from './pkcs12-kdf.js';
import { decrypt3DesCbc } from './vendor/des-ede3.js';
import { decryptRc2Cbc } from './vendor/rc2.js';
import { parseX509IssuerSerial } from './x509-der.js';

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_ENCRYPTED_DATA = '1.2.840.113549.1.7.6';
const OID_KEY_BAG = '1.2.840.113549.1.12.10.1.1';
const OID_SHROUDED = '1.2.840.113549.1.12.10.1.2';
const OID_CERT_BAG = '1.2.840.113549.1.12.10.1.3';
const OID_X509 = '1.2.840.113549.1.9.22.1';
const OID_PBE_3DES = '1.2.840.113549.1.12.1.3';
const OID_PBE_RC2_40 = '1.2.840.113549.1.12.1.6';
const OID_PBES2 = '1.2.840.113549.1.5.13';
const OID_PBKDF2 = '1.2.840.113549.1.5.12';
const OID_AES256_CBC = '2.16.840.1.101.3.4.1.42';
const OID_AES128_CBC = '2.16.840.1.101.3.4.1.2';

function fail(reason: string): never {
  throw new Error(`PKCS12_${reason}`);
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function hexSha256(bytes: Uint8Array): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', asBuffer(bytes))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

function unwrapExplicit(node: BerNode): BerNode {
  if ((node.tag & 0xc0) === 0x80) return readBer(node.bytes, 0).node;
  return node;
}

function parseContentInfo(node: BerNode): { oid: string; content: Uint8Array; contentTag: number } {
  const kids = unwrapSequence(node);
  if (kids.length < 1 || kids[0]!.tag !== 0x06) fail('CONTENT_INFO');
  const oid = decodeOid(kids[0]!.bytes);
  if (kids.length < 2) return { oid, content: new Uint8Array(), contentTag: 0 };
  const inner = unwrapExplicit(kids[1]!);
  return { oid, content: inner.bytes, contentTag: inner.tag };
}

function pbeParams(alg: BerNode): { salt: Uint8Array; iterations: number } {
  const kids = unwrapSequence(alg);
  if (kids.length < 2) fail('PBE_PARAMS');
  const params = unwrapSequence(kids[1]!);
  return { salt: unwrapOctet(params[0]!), iterations: decodeInteger(params[1]!.bytes) };
}

async function decryptPbe(
  oid: string,
  alg: BerNode,
  passwordBmp: Uint8Array,
  cipher: Uint8Array,
): Promise<Uint8Array> {
  if (oid === OID_PBE_3DES) {
    const { salt, iterations } = pbeParams(alg);
    const key = await pkcs12Kdf(passwordBmp, salt, 1, 24, iterations);
    const iv = await pkcs12Kdf(passwordBmp, salt, 2, 8, iterations);
    return decrypt3DesCbc(key, iv, cipher);
  }
  if (oid === OID_PBE_RC2_40) {
    const { salt, iterations } = pbeParams(alg);
    const key = await pkcs12Kdf(passwordBmp, salt, 1, 5, iterations);
    const iv = await pkcs12Kdf(passwordBmp, salt, 2, 8, iterations);
    return decryptRc2Cbc(key, 40, iv, cipher);
  }
  if (oid === OID_PBES2) return decryptPbes2(alg, passwordBmp, cipher);
  fail(`UNSUPPORTED_PBE:${oid}`);
}

async function decryptPbes2(
  alg: BerNode,
  passwordBmp: Uint8Array,
  cipher: Uint8Array,
): Promise<Uint8Array> {
  const kids = unwrapSequence(alg);
  const params = unwrapSequence(kids[1]!);
  const kdfSeq = unwrapSequence(params[0]!);
  const encSeq = unwrapSequence(params[1]!);
  if (decodeOid(kdfSeq[0]!.bytes) !== OID_PBKDF2) fail('PBKDF2');
  const kdfp = unwrapSequence(kdfSeq[1]!);
  const salt = unwrapOctet(kdfp[0]!);
  const iterations = decodeInteger(kdfp[1]!.bytes);
  const encOid = decodeOid(encSeq[0]!.bytes);
  const iv = unwrapOctet(encSeq[1]!);
  const keyLen = encOid === OID_AES128_CBC ? 16 : encOid === OID_AES256_CBC ? 32 : 0;
  if (!keyLen) fail(`UNSUPPORTED_AES:${encOid}`);
  const pwd = new TextDecoder('utf-16be').decode(passwordBmp.subarray(0, passwordBmp.length - 2));
  const keyRaw = await crypto.subtle.importKey(
    'raw',
    asBuffer(new TextEncoder().encode(pwd)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: asBuffer(salt), iterations },
    keyRaw,
    keyLen * 8,
  );
  const aes = await crypto.subtle.importKey('raw', bits, { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-CBC', iv: asBuffer(iv) }, aes, asBuffer(cipher)),
  );
  return plain;
}

function implicitOctet(node: BerNode): Uint8Array {
  if ((node.tag & 0x1f) === 0x04) return node.bytes;
  if ((node.tag & 0xc0) === 0x80) return node.bytes;
  fail('CIPHER');
}

async function decryptEncryptedData(
  content: Uint8Array,
  passwordBmp: Uint8Array,
): Promise<Uint8Array> {
  const seq = childrenOf(content);
  const body = seq[0]?.tag === 0x02 ? seq.slice(1) : seq;
  const eci = unwrapSequence(body[0]!);
  const alg = eci[1]!;
  const oid = decodeOid(unwrapSequence(alg)[0]!.bytes);
  return decryptPbe(oid, alg, passwordBmp, implicitOctet(eci[2]!));
}

function bagValue(node: BerNode): Uint8Array {
  return unwrapExplicit(node).bytes;
}

// eslint-disable-next-line complexity -- PKCS#12 SafeBag / shroudedKeyBag walk
function walkBags(safe: Uint8Array, bags: { pkcs8?: Uint8Array; certs: Uint8Array[] }): void {
  const items = safe[0] === 0x30 ? unwrapSequence(readBer(safe, 0).node) : childrenOf(safe);
  for (const item of items) {
    if ((item.tag & 0x1f) !== 0x10) continue;
    const kids = unwrapSequence(item);
    if (kids[0]?.tag !== 0x06) continue;
    const oid = decodeOid(kids[0].bytes);
    const value = kids[1] ? bagValue(kids[1]) : new Uint8Array();
    if (oid === OID_KEY_BAG) bags.pkcs8 = value;
    if (oid === OID_SHROUDED) bags.pkcs8 = value;
    if (oid === OID_CERT_BAG) {
      const certSeq = childrenOf(value);
      const innerOid = certSeq[0]?.tag === 0x06 ? decodeOid(certSeq[0].bytes) : '';
      if (innerOid === OID_X509 && certSeq[1]) {
        bags.certs.push(implicitOctet(unwrapExplicit(certSeq[1])));
      }
    }
  }
}

async function openShrouded(raw: Uint8Array, passwordBmp: Uint8Array): Promise<Uint8Array> {
  const seq = childrenOf(raw);
  if (seq.length < 2) fail('SHROUDED');
  const alg = seq[0]!;
  const oid = decodeOid(unwrapSequence(alg)[0]!.bytes);
  const cipher = unwrapOctet(seq[1]!);
  return decryptPbe(oid, alg, passwordBmp, cipher);
}

function notAfterIso(certDer: Uint8Array): string {
  const certKids = unwrapSequence(readBer(certDer, 0).node);
  const tbs = certKids[0];
  if (!tbs) fail('CERT');
  const kids = unwrapSequence(tbs);
  const validity = kids.find((n) => {
    if ((n.tag & 0x1f) !== 0x10) return false;
    try {
      const times = unwrapSequence(n);
      return times.length >= 2 && (times[1]!.tag === 0x17 || times[1]!.tag === 0x18);
    } catch {
      return false;
    }
  });
  const times = validity ? unwrapSequence(validity) : [];
  const raw = times[1]?.bytes ?? new Uint8Array();
  const text = new TextDecoder().decode(raw);
  if (/^\d{12}Z$/.test(text)) {
    const yy = Number(text.slice(0, 2));
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${year}-${text.slice(2, 4)}-${text.slice(4, 6)}T${text.slice(6, 8)}:${text.slice(8, 10)}:${text.slice(10, 12)}.000Z`;
  }
  if (/^\d{14}Z$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}.000Z`;
  }
  fail('NOT_AFTER');
}

export interface ParsedPkcs12 {
  readonly pkcs8Der: Uint8Array;
  readonly certDer: Uint8Array;
  readonly certChainPem: string;
  readonly fingerprintSha256: string;
  readonly expiresAt: string;
  readonly issuerSerial: { readonly issuerName: string; readonly serialDecimal: string };
}

function asSequenceItems(content: Uint8Array): BerNode[] {
  if (content.length === 0) return [];
  if (content[0] === 0x30) {
    const node = readBer(content, 0).node;
    const kids = unwrapSequence(node);
    if (kids[0]?.tag === 0x06) return [node];
    return kids;
  }
  return childrenOf(content);
}

async function ingestContent(
  oid: string,
  content: Uint8Array,
  passwordBmp: Uint8Array,
  bags: { pkcs8?: Uint8Array; certs: Uint8Array[] },
): Promise<void> {
  if (oid === OID_ENCRYPTED_DATA) {
    walkBags(await decryptEncryptedData(content, passwordBmp), bags);
    return;
  }
  if (oid !== OID_DATA) fail(`CONTENT:${oid}`);
  walkBags(content, bags);
  for (const node of asSequenceItems(content)) {
    if ((node.tag & 0x1f) !== 0x10) continue;
    try {
      const nested = parseContentInfo(node);
      if (nested.oid === OID_DATA || nested.oid === OID_ENCRYPTED_DATA) {
        await ingestContent(nested.oid, nested.content, passwordBmp, bags);
      }
    } catch {
      /* SafeBag */
    }
  }
}

export async function parsePkcs12(p12: Uint8Array, password: string): Promise<ParsedPkcs12> {
  if (p12.byteLength < 32) fail('TOO_SMALL');
  const bmp = encodePkcs12Password(password);
  const pfx = unwrapSequence(readBer(p12, 0).node);
  if (decodeInteger(pfx[0]!.bytes) !== 3) fail('VERSION');
  const auth = parseContentInfo(pfx[1]!);
  const bags: { pkcs8?: Uint8Array; certs: Uint8Array[] } = { certs: [] };
  await ingestContent(auth.oid, auth.content, bmp, bags);
  if (bags.pkcs8 && bags.pkcs8[0] === 0x30) {
    const kids = childrenOf(bags.pkcs8);
    if (kids[0]?.tag === 0x30 && kids[1]?.tag === 0x04) {
      bags.pkcs8 = await openShrouded(bags.pkcs8, bmp);
    }
  }
  if (!bags.pkcs8 || bags.certs.length === 0) fail('MISSING_BAGS');
  const certDer = bags.certs[0]!;
  const chain = bags.certs.map((c) => derToPem(c, 'CERTIFICATE')).join('\n');
  return {
    pkcs8Der: bags.pkcs8,
    certDer,
    certChainPem: chain,
    fingerprintSha256: await hexSha256(certDer),
    expiresAt: notAfterIso(certDer),
    issuerSerial: parseX509IssuerSerial(certDer),
  };
}
