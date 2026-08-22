/**
 * X.509 v3 mínimo: serial + issuer RFC 2253 (XAdES IssuerSerial) y
 * autocertificado de test. Zero-dep; no sustituye un stack ASN.1 completo.
 */

const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_NULL = 0x05;
const TAG_OID = 0x06;
const TAG_UTF8 = 0x0c;
const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;
const TAG_UTC_TIME = 0x17;
const TAG_CTX0 = 0xa0;
const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_MAP: Readonly<Record<string, string>> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'STREET',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'emailAddress',
};

export interface X509IssuerSerial {
  readonly issuerName: string;
  readonly serialDecimal: string;
}

interface DerNode {
  readonly tag: number;
  readonly bytes: Uint8Array;
}

function fail(reason: string): never {
  throw new Error(`INVALID_X509:${reason}`);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len);
  if (len < 0x100) return Uint8Array.of(0x81, len);
  if (len < 0x10000) return Uint8Array.of(0x82, (len >> 8) & 0xff, len & 0xff);
  fail('length');
}

function encodeTag(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes([Uint8Array.of(tag), encodeLength(content.length), content]);
}

function readDer(data: Uint8Array, offset = 0): { readonly node: DerNode; readonly next: number } {
  if (offset >= data.length) fail('eof');
  const tag = data[offset]!;
  let i = offset + 1;
  if (i >= data.length) fail('len');
  let len = data[i]!;
  i += 1;
  if (len > 0x7f) {
    const n = len & 0x7f;
    if (n === 0 || n > 3 || i + n > data.length) fail('len');
    len = 0;
    for (let k = 0; k < n; k += 1) len = (len << 8) | data[i + k]!;
    i += n;
  }
  if (i + len > data.length) fail('overflow');
  return { node: { tag, bytes: data.subarray(i, i + len) }, next: i + len };
}

function childrenOf(seq: Uint8Array): DerNode[] {
  const kids: DerNode[] = [];
  let i = 0;
  while (i < seq.length) {
    const { node, next } = readDer(seq, i);
    kids.push(node);
    i = next;
  }
  return kids;
}

function unwrapSequence(node: DerNode): DerNode[] {
  if (node.tag !== TAG_SEQUENCE) fail('sequence');
  return childrenOf(node.bytes);
}

function decodeOid(bytes: Uint8Array): string {
  if (bytes.length === 0) fail('oid');
  const first = bytes[0]!;
  const parts = [Math.floor(first / 40), first % 40];
  let acc = 0;
  for (let i = 1; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    acc = (acc << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) {
      parts.push(acc);
      acc = 0;
    } else if (i === bytes.length - 1) fail('oid');
  }
  return parts.join('.');
}

function encodeOid(oid: string): Uint8Array {
  const parts = oid.split('.').map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isInteger(n) || n < 0)) fail('oid');
  const body: number[] = [40 * parts[0]! + parts[1]!];
  for (const part of parts.slice(2)) {
    if (part === 0) {
      body.push(0);
      continue;
    }
    const tmp: number[] = [];
    let val = part;
    while (val > 0) {
      tmp.push(val & 0x7f);
      val = Math.floor(val / 128);
    }
    for (let i = tmp.length - 1; i >= 0; i -= 1) {
      body.push(i === 0 ? tmp[i]! : tmp[i]! | 0x80);
    }
  }
  return encodeTag(TAG_OID, Uint8Array.from(body));
}

function integerToDecimal(bytes: Uint8Array): string {
  if (bytes.length === 0) fail('serial');
  let i = 0;
  if (bytes[0] === 0 && bytes.length > 1) i = 1;
  let n = 0n;
  for (; i < bytes.length; i += 1) n = (n << 8n) | BigInt(bytes[i]!);
  return n.toString(10);
}

function encodeInteger(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0) fail('integer');
  if (n === 0) return encodeTag(TAG_INTEGER, Uint8Array.of(0));
  const tmp: number[] = [];
  let val = n;
  while (val > 0) {
    tmp.push(val & 0xff);
    val = Math.floor(val / 256);
  }
  tmp.reverse();
  if (tmp[0]! & 0x80) tmp.unshift(0);
  return encodeTag(TAG_INTEGER, Uint8Array.from(tmp));
}

function decodeDirectoryString(node: DerNode): string {
  if (node.tag === TAG_UTF8 || node.tag === 0x13 || node.tag === 0x16 || node.tag === 0x14) {
    return new TextDecoder('utf-8').decode(node.bytes);
  }
  if (node.tag === 0x1e) {
    if (node.bytes.length % 2 !== 0) fail('bmp');
    let out = '';
    for (let i = 0; i < node.bytes.length; i += 2) {
      out += String.fromCharCode((node.bytes[i]! << 8) | node.bytes[i + 1]!);
    }
    return out;
  }
  fail('dirstring');
}

// eslint-disable-next-line complexity -- RFC 2253 special-char escapes
function escapeRfc2253(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (
      ch === ',' ||
      ch === '+' ||
      ch === '"' ||
      ch === '\\' ||
      ch === '<' ||
      ch === '>' ||
      ch === ';'
    ) {
      out += `\\${ch}`;
    } else if (ch === '#' && i === 0) out += '\\#';
    else if (ch === ' ' && (i === 0 || i === value.length - 1)) out += '\\ ';
    else out += ch;
  }
  return out;
}

function parseName(node: DerNode): string {
  if (node.tag !== TAG_SEQUENCE) fail('name');
  const rdns = childrenOf(node.bytes);
  const attrs: string[] = [];
  for (const rdn of rdns) {
    if (rdn.tag !== TAG_SET) fail('rdn');
    const avas = childrenOf(rdn.bytes).map((ava) => {
      const seq = unwrapSequence(ava);
      if (seq.length < 2 || seq[0]!.tag !== TAG_OID) fail('ava');
      const oid = decodeOid(seq[0]!.bytes);
      const raw = decodeDirectoryString(seq[1]!);
      const key = OID_MAP[oid] ?? `OID.${oid}`;
      return `${key}=${escapeRfc2253(raw)}`;
    });
    attrs.push(avas.join('+'));
  }
  return attrs.reverse().join(',');
}

function tbsCertificate(certSeq: Uint8Array): DerNode[] {
  const cert = readDer(certSeq).node;
  if (cert.tag !== TAG_SEQUENCE) fail('cert');
  const top = childrenOf(cert.bytes);
  if (top.length < 1 || top[0]!.tag !== TAG_SEQUENCE) fail('tbs');
  return childrenOf(top[0]!.bytes);
}

export function parseX509IssuerSerial(certDer: Uint8Array): X509IssuerSerial {
  const tbs = tbsCertificate(certDer);
  let i = 0;
  if (tbs[0]?.tag === TAG_CTX0) i = 1;
  const serial = tbs[i];
  const issuer = tbs[i + 2];
  if (!serial || serial.tag !== TAG_INTEGER || !issuer) fail('issuer-serial');
  return { issuerName: parseName(issuer), serialDecimal: integerToDecimal(serial.bytes) };
}

export function extractSpkiFromX509(certDer: Uint8Array): Uint8Array {
  const tbs = tbsCertificate(certDer);
  let i = 0;
  if (tbs[0]?.tag === TAG_CTX0) i = 1;
  const spki = tbs[i + 5];
  if (!spki || spki.tag !== TAG_SEQUENCE) fail('spki');
  return encodeTag(TAG_SEQUENCE, spki.bytes);
}

function encodeUtf8(tag: number, value: string): Uint8Array {
  return encodeTag(tag, new TextEncoder().encode(value));
}

function encodeRdn(oid: string, value: string): Uint8Array {
  return encodeTag(
    TAG_SET,
    encodeTag(TAG_SEQUENCE, concatBytes([encodeOid(oid), encodeUtf8(TAG_UTF8, value)])),
  );
}

function encodeName(cn: string, org: string, country: string): Uint8Array {
  return encodeTag(
    TAG_SEQUENCE,
    concatBytes([
      encodeRdn('2.5.4.6', country),
      encodeRdn('2.5.4.10', org),
      encodeRdn('2.5.4.3', cn),
    ]),
  );
}

function utcTime(isoDate: string): Uint8Array {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) fail('time');
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return encodeTag(TAG_UTC_TIME, new TextEncoder().encode(`${yy}${mo}${dd}${hh}${mm}${ss}Z`));
}

function sha256RsaAlg(): Uint8Array {
  return encodeTag(
    TAG_SEQUENCE,
    concatBytes([encodeOid(OID_SHA256_RSA), encodeTag(TAG_NULL, new Uint8Array())]),
  );
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Autocertificado RSA-SHA256 para tests (CN/O/C). No usar en producción.
 */
export async function issueSelfSignedX509(input: {
  readonly privateKeyPkcs8Der: Uint8Array;
  readonly spkiDer: Uint8Array;
  readonly commonName: string;
  readonly organization: string;
  readonly country: string;
  readonly serial?: number;
  readonly notBefore?: string;
  readonly notAfter?: string;
}): Promise<Uint8Array> {
  const name = encodeName(input.commonName, input.organization, input.country);
  const version = encodeTag(TAG_CTX0, encodeInteger(2));
  const serial = encodeInteger(input.serial ?? 1);
  const alg = sha256RsaAlg();
  const validity = encodeTag(
    TAG_SEQUENCE,
    concatBytes([
      utcTime(input.notBefore ?? '2026-01-01T00:00:00.000Z'),
      utcTime(input.notAfter ?? '2036-01-01T00:00:00.000Z'),
    ]),
  );
  const tbs = encodeTag(
    TAG_SEQUENCE,
    concatBytes([version, serial, alg, name, validity, name, input.spkiDer]),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    asBuffer(input.privateKeyPkcs8Der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, asBuffer(tbs)),
  );
  const bitString = encodeTag(TAG_BIT_STRING, concatBytes([Uint8Array.of(0), sig]));
  return encodeTag(TAG_SEQUENCE, concatBytes([tbs, alg, bitString]));
}
