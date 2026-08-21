/**
 * RFC 1951 raw inflate (tiny-inflate / tinf). Ver TINY-INFLATE-LICENSE.txt.
 * Fallback cuando DecompressionStream de Workers rechaza el DEFLATE de SUNAT.
 */
const TINF_OK = 0;
const TINF_DATA_ERROR = -3;

class Tree {
  readonly table = new Uint16Array(16);
  readonly trans = new Uint16Array(288);
}

class InflateState {
  sourceIndex = 0;
  tag = 0;
  bitcount = 0;
  destLen = 0;
  readonly ltree = new Tree();
  readonly dtree = new Tree();
  constructor(
    readonly source: Uint8Array,
    readonly dest: Uint8Array,
  ) {}
}

const sltree = new Tree();
const sdtree = new Tree();
const lengthBits = new Uint8Array(30);
const lengthBase = new Uint16Array(30);
const distBits = new Uint8Array(30);
const distBase = new Uint16Array(30);
const clcidx = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
const codeTree = new Tree();
const lengths = new Uint8Array(288 + 32);
const offs = new Uint16Array(16);

function buildBitsBase(bits: Uint8Array, base: Uint16Array, delta: number, first: number): void {
  for (let i = 0; i < delta; i += 1) bits[i] = 0;
  for (let i = 0; i < 30 - delta; i += 1) bits[i + delta] = (i / delta) | 0;
  let sum = first;
  for (let i = 0; i < 30; i += 1) {
    base[i] = sum;
    sum += 1 << bits[i]!;
  }
}

function buildFixedTrees(lt: Tree, dt: Tree): void {
  for (let i = 0; i < 7; i += 1) lt.table[i] = 0;
  lt.table[7] = 24;
  lt.table[8] = 152;
  lt.table[9] = 112;
  for (let i = 0; i < 24; i += 1) lt.trans[i] = 256 + i;
  for (let i = 0; i < 144; i += 1) lt.trans[24 + i] = i;
  for (let i = 0; i < 8; i += 1) lt.trans[24 + 144 + i] = 280 + i;
  for (let i = 0; i < 112; i += 1) lt.trans[24 + 144 + 8 + i] = 144 + i;
  for (let i = 0; i < 5; i += 1) dt.table[i] = 0;
  dt.table[5] = 32;
  for (let i = 0; i < 32; i += 1) dt.trans[i] = i;
}

function buildTree(t: Tree, codeLengths: Uint8Array, off: number, num: number): void {
  for (let i = 0; i < 16; i += 1) t.table[i] = 0;
  for (let i = 0; i < num; i += 1) t.table[codeLengths[off + i]!]! += 1;
  t.table[0] = 0;
  let sum = 0;
  for (let i = 0; i < 16; i += 1) {
    offs[i] = sum;
    sum += t.table[i]!;
  }
  for (let i = 0; i < num; i += 1) {
    const len = codeLengths[off + i]!;
    if (len) t.trans[offs[len]++] = i;
  }
}

function getbit(d: InflateState): number {
  if (d.sourceIndex > d.source.length + 4 || d.destLen > d.dest.length) {
    throw new Error('ZIP_INFLATE_DATA');
  }
  if (!d.bitcount--) {
    d.tag = d.source[d.sourceIndex++] ?? 0;
    d.bitcount = 7;
  }
  const bit = d.tag & 1;
  d.tag >>>= 1;
  return bit;
}

function readBits(d: InflateState, num: number, base: number): number {
  if (!num) return base;
  while (d.bitcount < 24) {
    d.tag |= (d.source[d.sourceIndex++] ?? 0) << d.bitcount;
    d.bitcount += 8;
  }
  const val = d.tag & (0xffff >>> (16 - num));
  d.tag >>>= num;
  d.bitcount -= num;
  return val + base;
}

function decodeSymbol(d: InflateState, t: Tree): number {
  while (d.bitcount < 24) {
    d.tag |= (d.source[d.sourceIndex++] ?? 0) << d.bitcount;
    d.bitcount += 8;
  }
  let sum = 0;
  let cur = 0;
  let len = 0;
  let tag = d.tag;
  do {
    cur = 2 * cur + (tag & 1);
    tag >>>= 1;
    len += 1;
    sum += t.table[len]!;
    cur -= t.table[len]!;
  } while (cur >= 0);
  d.tag = tag;
  d.bitcount -= len;
  return t.trans[sum + cur]!;
}

function decodeTrees(d: InflateState, lt: Tree, dt: Tree): void {
  const hlit = readBits(d, 5, 257);
  const hdist = readBits(d, 5, 1);
  const hclen = readBits(d, 4, 4);
  for (let i = 0; i < 19; i += 1) lengths[i] = 0;
  for (let i = 0; i < hclen; i += 1) {
    lengths[clcidx[i]!] = readBits(d, 3, 0);
  }
  buildTree(codeTree, lengths, 0, 19);
  for (let num = 0; num < hlit + hdist; ) {
    const sym = decodeSymbol(d, codeTree);
    if (sym === 16) {
      const prev = lengths[num - 1]!;
      for (let length = readBits(d, 2, 3); length; length -= 1) {
        lengths[num++] = prev;
      }
    } else if (sym === 17) {
      for (let length = readBits(d, 3, 3); length; length -= 1) {
        lengths[num++] = 0;
      }
    } else if (sym === 18) {
      for (let length = readBits(d, 7, 11); length; length -= 1) {
        lengths[num++] = 0;
      }
    } else {
      lengths[num++] = sym;
    }
  }
  buildTree(lt, lengths, 0, hlit);
  buildTree(dt, lengths, hlit, hdist);
}

function inflateBlockData(d: InflateState, lt: Tree, dt: Tree): number {
  for (;;) {
    if (d.destLen >= d.dest.length || d.sourceIndex > d.source.length + 16) {
      return TINF_DATA_ERROR;
    }
    const sym0 = decodeSymbol(d, lt);
    if (sym0 === 256) return TINF_OK;
    if (sym0 < 256) {
      d.dest[d.destLen++] = sym0;
    } else {
      const sym = sym0 - 257;
      const length = readBits(d, lengthBits[sym]!, lengthBase[sym]!);
      const dist = decodeSymbol(d, dt);
      const copyOff = d.destLen - readBits(d, distBits[dist]!, distBase[dist]!);
      for (let i = copyOff; i < copyOff + length; i += 1) {
        d.dest[d.destLen++] = d.dest[i]!;
      }
    }
  }
}

function inflateUncompressedBlock(d: InflateState): number {
  while (d.bitcount > 8) {
    d.sourceIndex -= 1;
    d.bitcount -= 8;
  }
  let length = d.source[d.sourceIndex + 1] ?? 0;
  length = 256 * length + (d.source[d.sourceIndex] ?? 0);
  let invlength = d.source[d.sourceIndex + 3] ?? 0;
  invlength = 256 * invlength + (d.source[d.sourceIndex + 2] ?? 0);
  if (length !== (~invlength & 0x0000ffff)) return TINF_DATA_ERROR;
  d.sourceIndex += 4;
  for (let i = length; i; i -= 1) {
    d.dest[d.destLen++] = d.source[d.sourceIndex++] ?? 0;
  }
  d.bitcount = 0;
  return TINF_OK;
}

buildFixedTrees(sltree, sdtree);
buildBitsBase(lengthBits, lengthBase, 4, 3);
buildBitsBase(distBits, distBase, 2, 1);
lengthBits[28] = 0;
lengthBase[28] = 258;

export function inflateRawSync(source: Uint8Array, dest: Uint8Array): Uint8Array {
  const d = new InflateState(source, dest);
  let bfinal = 0;
  do {
    bfinal = getbit(d);
    const btype = readBits(d, 2, 0);
    let res = TINF_DATA_ERROR;
    if (btype === 0) res = inflateUncompressedBlock(d);
    else if (btype === 1) res = inflateBlockData(d, sltree, sdtree);
    else if (btype === 2) {
      decodeTrees(d, d.ltree, d.dtree);
      res = inflateBlockData(d, d.ltree, d.dtree);
    }
    if (res !== TINF_OK) throw new Error('ZIP_INFLATE_DATA');
  } while (!bfinal);
  return d.dest.subarray(0, d.destLen);
}
