/**
 * ZIP STORE (método 0) + lectura STORE/DEFLATE — zero-dep Web Platform.
 * SUNAT billService exige ZIP del XML, no el XML suelto.
 */
import { inflateRawSync } from './vendor/tiny-inflate.js';

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

/** Empaqueta uno o más archivos sin comprimir (STORE). */
export function zipStoreFiles(
  files: ReadonlyArray<{ readonly name: string; readonly content: Uint8Array }>,
): Uint8Array {
  if (files.length < 1) throw new Error('ZIP_EMPTY');
  const entries = files.map((file) => ({
    nameBytes: new TextEncoder().encode(file.name),
    content: file.content,
    crc: crc32(file.content),
  }));
  let localTotal = 0;
  let centralTotal = 0;
  for (const entry of entries) {
    localTotal += 30 + entry.nameBytes.length + entry.content.length;
    centralTotal += 46 + entry.nameBytes.length;
  }
  const out = new Uint8Array(localTotal + centralTotal + 22);
  let offset = 0;
  const localOffs: number[] = [];
  for (const entry of entries) {
    localOffs.push(offset);
    out[offset] = 0x50;
    out[offset + 1] = 0x4b;
    out[offset + 2] = 0x03;
    out[offset + 3] = 0x04;
    const lv = new DataView(out.buffer, offset);
    u16(lv, 4, 20);
    u16(lv, 8, 0);
    u32(lv, 14, entry.crc);
    u32(lv, 18, entry.content.length);
    u32(lv, 22, entry.content.length);
    u16(lv, 26, entry.nameBytes.length);
    out.set(entry.nameBytes, offset + 30);
    out.set(entry.content, offset + 30 + entry.nameBytes.length);
    offset += 30 + entry.nameBytes.length + entry.content.length;
  }
  const cdStart = offset;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    out[offset] = 0x50;
    out[offset + 1] = 0x4b;
    out[offset + 2] = 0x01;
    out[offset + 3] = 0x02;
    const cv = new DataView(out.buffer, offset);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u32(cv, 16, entry.crc);
    u32(cv, 20, entry.content.length);
    u32(cv, 24, entry.content.length);
    u16(cv, 28, entry.nameBytes.length);
    u32(cv, 42, localOffs[i]!);
    out.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  }
  out[offset] = 0x50;
  out[offset + 1] = 0x4b;
  out[offset + 2] = 0x05;
  out[offset + 3] = 0x06;
  const ev = new DataView(out.buffer, offset);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, centralTotal);
  u32(ev, 16, cdStart);
  return out;
}

/** Empaqueta un solo archivo sin comprimir (STORE). */
export function zipStore(fileName: string, content: Uint8Array): Uint8Array {
  return zipStoreFiles([{ name: fileName, content }]);
}

async function inflateWith(format: CompressionFormat, data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  await writer.write(data);
  await writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function inflateJs(data: Uint8Array): Uint8Array {
  const dest = new Uint8Array(64 * 1024);
  return inflateRawSync(data, dest);
}

async function inflateCdr(data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) throw new Error('ZIP_EMPTY_PAYLOAD');
  try {
    const raw = await inflateWith('deflate-raw', data);
    if (raw.length > 0) return raw;
  } catch {
    // Workers a veces rechaza el DEFLATE Java/SUNAT.
  }
  try {
    const zlib = await inflateWith('deflate', data);
    if (zlib.length > 0) return zlib;
  } catch {
    // fallback JS
  }
  const js = inflateJs(data);
  if (js.length === 0) throw new Error('ZIP_EMPTY_INFLATE');
  return js;
}

function findEocd(zip: Uint8Array): number {
  const min = Math.max(0, zip.length - 22 - 65535);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip[i] !== 0x50 || zip[i + 1] !== 0x4b || zip[i + 2] !== 0x05 || zip[i + 3] !== 0x06) {
      continue;
    }
    const commentLen = view.getUint16(i + 20, true);
    if (i + 22 + commentLen !== zip.length) continue;
    const entries = view.getUint16(i + 8, true);
    const cdOff = view.getUint32(i + 16, true);
    if (entries < 1) continue;
    if (
      cdOff + 4 > zip.length ||
      zip[cdOff] !== 0x50 ||
      zip[cdOff + 1] !== 0x4b ||
      zip[cdOff + 2] !== 0x01 ||
      zip[cdOff + 3] !== 0x02
    ) {
      continue;
    }
    return i;
  }
  return -1;
}

function stripDataDescriptor(payload: Uint8Array): Uint8Array {
  if (
    payload.length >= 16 &&
    payload[payload.length - 16] === 0x50 &&
    payload[payload.length - 15] === 0x4b &&
    payload[payload.length - 14] === 0x07 &&
    payload[payload.length - 13] === 0x08
  ) {
    return payload.subarray(0, payload.length - 16);
  }
  return payload;
}

async function inflateBest(payload: Uint8Array): Promise<Uint8Array> {
  if (payload.length === 0) throw new Error('ZIP_EMPTY_PAYLOAD');
  const attempts = [payload];
  if (payload.length > 16) attempts.push(payload.subarray(0, payload.length - 16));
  if (payload.length > 12) attempts.push(payload.subarray(0, payload.length - 12));
  let lastErr: unknown;
  for (const slice of attempts) {
    try {
      return await inflateCdr(slice);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ZIP_INFLATE');
}

function findSigForward(
  zip: Uint8Array,
  from: number,
  until: number,
  b2: number,
  b3: number,
): number {
  const end = Math.min(zip.length - 4, until - 4);
  for (let i = from; i <= end; i += 1) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === b2 && zip[i + 3] === b3) return i;
  }
  return -1;
}

function findSigReverse(zip: Uint8Array, until: number, b2: number, b3: number): number {
  const max = Math.min(zip.length - 4, until - 4);
  for (let i = max; i >= 0; i -= 1) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === b2 && zip[i + 3] === b3) return i;
  }
  return -1;
}

// eslint-disable-next-line complexity -- ZIP local-file scan + inflate/store branches
async function unzipByScanningLocals(
  zip: Uint8Array,
  until: number,
): Promise<Array<{ name: string; content: Uint8Array }>> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let off = 0;
  const files: Array<{ name: string; content: Uint8Array }> = [];
  while (
    off + 30 <= until &&
    zip[off] === 0x50 &&
    zip[off + 1] === 0x4b &&
    zip[off + 2] === 0x03 &&
    zip[off + 3] === 0x04
  ) {
    const method = view.getUint16(off + 8, true);
    const localComp = view.getUint32(off + 18, true);
    const localUncomp = view.getUint32(off + 22, true);
    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const name = new TextDecoder().decode(zip.subarray(off + 30, off + 30 + nameLen));
    const dataStart = off + 30 + nameLen + extraLen;
    if (name.endsWith('/')) {
      files.push({ name, content: new Uint8Array() });
      off = dataStart + (localComp > 0 && localComp < 64 ? localComp : 0);
      if (off + 4 > until || zip[off] !== 0x50 || zip[off + 2] !== 0x03) {
        const next = findSigForward(zip, dataStart, until, 0x03, 0x04);
        if (next >= dataStart) off = next;
      }
      continue;
    }
    const implausibleDeflate =
      method === 8 && (localComp < 16 || localUncomp === 0) && until - dataStart > 64;
    let dataEnd: number;
    if (method === 0 && localComp === 0) {
      const nextLocal = findSigForward(zip, dataStart, until, 0x03, 0x04);
      const nextCd = findSigForward(zip, dataStart, until, 0x01, 0x02);
      const hits = [nextLocal, nextCd].filter((n) => n >= dataStart);
      dataEnd = hits.length > 0 ? Math.min(...hits) : dataStart;
    } else if (implausibleDeflate || (method === 8 && localComp === 0)) {
      const nextCd = findSigReverse(zip, until, 0x01, 0x02);
      dataEnd = nextCd >= dataStart ? nextCd : until;
    } else {
      dataEnd = dataStart + localComp;
    }
    if (dataEnd > until) dataEnd = until;
    const payload = stripDataDescriptor(zip.subarray(dataStart, dataEnd));
    let content: Uint8Array;
    if (method === 0) content = payload.slice();
    else if (method === 8) content = await inflateBest(payload);
    else throw new Error(`ZIP_METHOD_UNSUPPORTED:${method}`);
    files.push({ name, content });
    off = dataEnd;
    if (off + 4 <= until && zip[off] === 0x50 && zip[off + 2] === 0x07 && zip[off + 3] === 0x08) {
      off += 16;
    }
  }
  if (files.length === 0) throw new Error('ZIP_INVALID');
  return files;
}

async function extractLocalPayload(
  zip: Uint8Array,
  view: DataView,
  localOff: number,
  cd: { readonly method: number; readonly flags: number; readonly compSize: number },
): Promise<Uint8Array> {
  if (localOff + 30 > zip.length) throw new Error('ZIP_TRUNCATED');
  const nameLen = view.getUint16(localOff + 26, true);
  const extraLen = view.getUint16(localOff + 28, true);
  const dataStart = localOff + 30 + nameLen + extraLen;
  const method = view.getUint16(localOff + 8, true) || cd.method;
  const gpbf = view.getUint16(localOff + 6, true);
  let compSize = cd.compSize;
  const localComp = view.getUint32(localOff + 18, true);
  if (compSize === 0 && localComp > 0) compSize = localComp;
  if (compSize === 0 && localComp === 0 && method === 0 && (gpbf & 0x0008) === 0) {
    return new Uint8Array();
  }
  if (method === 8 && compSize < 16) {
    const scanned = await unzipByScanningLocals(zip, zip.length);
    const hit = scanned.find((file) => file.content.length > 0 && !file.name.endsWith('/'));
    if (hit) return hit.content;
  }
  const dataEnd = dataStart + compSize;
  if (dataEnd > zip.length) throw new Error('ZIP_TRUNCATED');
  const payload = stripDataDescriptor(zip.subarray(dataStart, dataEnd));
  if (method === 0) return payload.slice();
  if (method === 8) return inflateBest(payload);
  throw new Error(`ZIP_METHOD_UNSUPPORTED:${method}`);
}

export async function unzipAllFiles(
  zip: Uint8Array,
): Promise<ReadonlyArray<{ readonly name: string; readonly content: Uint8Array }>> {
  if (zip.length < 30 || zip[0] !== 0x50 || zip[1] !== 0x4b) {
    throw new Error('ZIP_INVALID');
  }
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = findEocd(zip);
  if (eocd < 0) {
    return unzipByScanningLocals(zip, zip.length);
  }
  const entryCount = view.getUint16(eocd + 8, true);
  let cdOff = view.getUint32(eocd + 16, true);
  const files: Array<{ name: string; content: Uint8Array }> = [];
  try {
    for (let i = 0; i < entryCount; i += 1) {
      if (
        cdOff + 46 > zip.length ||
        zip[cdOff] !== 0x50 ||
        zip[cdOff + 1] !== 0x4b ||
        zip[cdOff + 2] !== 0x01 ||
        zip[cdOff + 3] !== 0x02
      ) {
        break;
      }
      const flags = view.getUint16(cdOff + 8, true);
      const method = view.getUint16(cdOff + 10, true);
      const compSize = view.getUint32(cdOff + 20, true);
      const nameLen = view.getUint16(cdOff + 28, true);
      const extraLen = view.getUint16(cdOff + 30, true);
      const commentLen = view.getUint16(cdOff + 32, true);
      const localOff = view.getUint32(cdOff + 42, true);
      const name = new TextDecoder().decode(zip.subarray(cdOff + 46, cdOff + 46 + nameLen));
      if (name.endsWith('/')) {
        files.push({ name, content: new Uint8Array() });
        cdOff += 46 + nameLen + extraLen + commentLen;
        continue;
      }
      const content = await extractLocalPayload(zip, view, localOff, { method, flags, compSize });
      files.push({ name, content });
      cdOff += 46 + nameLen + extraLen + commentLen;
    }
  } catch {
    files.length = 0;
  }
  if (files.some((file) => file.content.length > 0)) return files;
  return unzipByScanningLocals(zip, zip.length);
}

export async function unzipFirstFile(
  zip: Uint8Array,
): Promise<{ readonly name: string; readonly content: Uint8Array }> {
  const files = await unzipAllFiles(zip);
  const nonempty = files.find((file) => file.content.length > 0 && !file.name.endsWith('/'));
  return nonempty ?? files.find((file) => file.content.length > 0) ?? files[0]!;
}
