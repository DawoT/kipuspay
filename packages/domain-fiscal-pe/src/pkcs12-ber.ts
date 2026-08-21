/**
 * Lector BER mínimo: definite + indefinite (EOC) y OCTET STRING construido.
 * Necesario para PKCS#12 Java/SUNAT (chunks de 1000).
 */

export interface BerNode {
  readonly tag: number;
  readonly bytes: Uint8Array;
}

function fail(reason: string): never {
  throw new Error(`PKCS12_BER:${reason}`);
}

export function readBer(
  data: Uint8Array,
  offset = 0,
): { readonly node: BerNode; readonly next: number } {
  if (offset >= data.length) fail('eof');
  const tag = data[offset]!;
  let i = offset + 1;
  if (i >= data.length) fail('len');
  const lenByte = data[i]!;
  i += 1;
  if (lenByte === 0x80) {
    if ((tag & 0x20) === 0) fail('indefinite-primitive');
    const kids: Uint8Array[] = [];
    const octet = (tag & 0x1f) === 0x04;
    while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) {
      const inner = readBer(data, i);
      kids.push(octet ? inner.node.bytes : encodeNode(inner.node));
      i = inner.next;
    }
    if (i + 1 >= data.length) fail('eoc');
    i += 2;
    return { node: { tag, bytes: concat(kids) }, next: i };
  }
  let len = lenByte;
  if (lenByte > 0x7f) {
    const n = lenByte & 0x7f;
    if (n === 0 || n > 4 || i + n > data.length) fail('len');
    len = 0;
    for (let k = 0; k < n; k += 1) len = (len << 8) | data[i + k]!;
    i += n;
  }
  if (i + len > data.length) fail('overflow');
  let content = data.subarray(i, i + len);
  const next = i + len;
  if ((tag & 0x20) !== 0 && tag === 0x24) {
    content = flattenOctets(content);
  }
  return { node: { tag, bytes: content }, next };
}

function encodeNode(node: BerNode): Uint8Array {
  return concat([Uint8Array.of(node.tag), encodeLength(node.bytes.length), node.bytes]);
}

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len);
  if (len < 0x100) return Uint8Array.of(0x81, len);
  if (len < 0x10000) return Uint8Array.of(0x82, (len >> 8) & 0xff, len & 0xff);
  if (len < 0x1000000)
    return Uint8Array.of(0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
  fail('length');
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function flattenOctets(constructed: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let i = 0;
  while (i < constructed.length) {
    if (constructed[i] === 0 && constructed[i + 1] === 0) break;
    const { node, next } = readBer(constructed, i);
    if ((node.tag & 0x1f) === 0x04) chunks.push(node.bytes);
    else chunks.push(encodeNode(node));
    i = next;
  }
  return concat(chunks);
}

export function childrenOf(seq: Uint8Array): BerNode[] {
  const kids: BerNode[] = [];
  let i = 0;
  while (i < seq.length) {
    if (seq[i] === 0 && seq[i + 1] === 0) break;
    const { node, next } = readBer(seq, i);
    kids.push(node);
    i = next;
  }
  return kids;
}

export function unwrapSequence(node: BerNode): BerNode[] {
  if ((node.tag & 0x1f) !== 0x10) fail('sequence');
  return childrenOf(node.bytes);
}

export function unwrapOctet(node: BerNode): Uint8Array {
  if ((node.tag & 0x1f) === 0x04) return node.bytes;
  fail('octet');
}

export function decodeOid(bytes: Uint8Array): string {
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

export function decodeInteger(bytes: Uint8Array): number {
  if (bytes.length === 0 || bytes.length > 6) fail('int');
  let n = 0;
  for (const b of bytes) n = (n << 8) | b;
  return n;
}

export function derToPem(der: Uint8Array, label: string): string {
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const b64 = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64.replace(/\n$/, '')}\n-----END ${label}-----`;
}

export { concat as concatBytes };
