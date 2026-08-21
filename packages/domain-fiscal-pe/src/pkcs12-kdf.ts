/**
 * PKCS#12 KDF (RFC 7292 apéndice B) con SHA-1. ID=1 key, 2 IV, 3 MAC.
 */

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function repeatTo(src: Uint8Array, v: number): Uint8Array {
  if (src.length === 0) return new Uint8Array(0);
  const n = Math.ceil(src.length / v) * v;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = src[i % src.length]!;
  return out;
}

function addBlocks(i: Uint8Array, b: Uint8Array): void {
  const v = b.length;
  for (let off = 0; off < i.length; off += v) {
    let carry = 1;
    for (let j = v - 1; j >= 0; j -= 1) {
      const sum = i[off + j]! + b[j]! + carry;
      i[off + j] = sum & 0xff;
      carry = sum >> 8;
    }
  }
}

export function encodePkcs12Password(password: string): Uint8Array {
  const out = new Uint8Array((password.length + 1) * 2);
  for (let i = 0; i < password.length; i += 1) {
    const c = password.charCodeAt(i);
    out[i * 2] = (c >> 8) & 0xff;
    out[i * 2 + 1] = c & 0xff;
  }
  return out;
}

export async function pkcs12Kdf(
  passwordBmp: Uint8Array,
  salt: Uint8Array,
  id: 1 | 2 | 3,
  n: number,
  iterations: number,
): Promise<Uint8Array> {
  const u = 20;
  const v = 64;
  const d = new Uint8Array(v).fill(id);
  const s = repeatTo(salt, v);
  const p = repeatTo(passwordBmp, v);
  const i = new Uint8Array(s.length + p.length);
  i.set(s, 0);
  i.set(p, s.length);
  const out = new Uint8Array(n);
  let produced = 0;
  while (produced < n) {
    let a = new Uint8Array(d.length + i.length);
    a.set(d, 0);
    a.set(i, d.length);
    for (let round = 0; round < iterations; round += 1) {
      a = new Uint8Array(await crypto.subtle.digest('SHA-1', asBuffer(a)));
    }
    const b = repeatTo(a, v);
    addBlocks(i, b);
    const take = Math.min(u, n - produced);
    out.set(a.subarray(0, take), produced);
    produced += take;
  }
  return out;
}
