import { describe, expect, it } from 'vitest';
import { unzipFirstFile, zipStore, zipStoreFiles, crc32 } from './zip-store.js';
import { inflateRawSync } from './vendor/tiny-inflate.js';

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

/** ZIP DEFLATE con data descriptor (típico CDR Java/SUNAT: sizes 0 en local header). */
async function zipDeflateDataDescriptor(
  fileName: string,
  content: Uint8Array,
): Promise<Uint8Array> {
  const nameBytes = new TextEncoder().encode(fileName);
  const compressed = await deflateRaw(content);
  const crc = crc32(content);
  const localLen = 30 + nameBytes.length;
  const descLen = 16;
  const centralLen = 46 + nameBytes.length;
  const eocdLen = 22;
  const out = new Uint8Array(localLen + compressed.length + descLen + centralLen + eocdLen);
  const view = new DataView(out.buffer);
  out[0] = 0x50;
  out[1] = 0x4b;
  out[2] = 0x03;
  out[3] = 0x04;
  u16(view, 4, 20);
  u16(view, 6, 0x0008);
  u16(view, 8, 8);
  u16(view, 26, nameBytes.length);
  out.set(nameBytes, 30);
  out.set(compressed, localLen);
  const descOff = localLen + compressed.length;
  out[descOff] = 0x50;
  out[descOff + 1] = 0x4b;
  out[descOff + 2] = 0x07;
  out[descOff + 3] = 0x08;
  const dv = new DataView(out.buffer, descOff);
  u32(dv, 4, crc);
  u32(dv, 8, compressed.length);
  u32(dv, 12, content.length);
  const centralOff = descOff + descLen;
  out[centralOff] = 0x50;
  out[centralOff + 1] = 0x4b;
  out[centralOff + 2] = 0x01;
  out[centralOff + 3] = 0x02;
  const cv = new DataView(out.buffer, centralOff);
  u16(cv, 4, 20);
  u16(cv, 6, 20);
  u16(cv, 8, 0x0008);
  u16(cv, 10, 8);
  u32(cv, 16, crc);
  u32(cv, 20, compressed.length);
  u32(cv, 24, content.length);
  u16(cv, 28, nameBytes.length);
  u32(cv, 42, 0);
  out.set(nameBytes, centralOff + 46);
  const eocdOff = centralOff + centralLen;
  out[eocdOff] = 0x50;
  out[eocdOff + 1] = 0x4b;
  out[eocdOff + 2] = 0x05;
  out[eocdOff + 3] = 0x06;
  const ev = new DataView(out.buffer, eocdOff);
  u16(ev, 8, 1);
  u16(ev, 10, 1);
  u32(ev, 12, centralLen);
  u32(ev, 16, centralOff);
  return out;
}

describe('unzipFirstFile', () => {
  it('STORE roundtrip', async () => {
    const xml = new TextEncoder().encode('<cbc:ResponseCode>0</cbc:ResponseCode>');
    const zip = zipStore('R-1.xml', xml);
    const out = await unzipFirstFile(zip);
    expect(out.name).toBe('R-1.xml');
    expect(new TextDecoder().decode(out.content)).toContain('ResponseCode>0<');
  });

  it('DEFLATE con data descriptor (CDR SUNAT) lee ResponseCode', async () => {
    const xml = new TextEncoder().encode(
      // eslint-disable-next-line no-secrets/no-secrets -- CDR XML fixture
      '<cbc:ResponseCode listAgencyName="PE:SUNAT">0</cbc:ResponseCode><cbc:Description>aceptada</cbc:Description>',
    );
    const zip = await zipDeflateDataDescriptor('R-20612913251-01-F001-00000008.xml', xml);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(18, true)).toBe(0);
    const out = await unzipFirstFile(zip);
    expect(new TextDecoder().decode(out.content)).toContain('ResponseCode');
    expect(new TextDecoder().decode(out.content)).toContain('>0<');
  });

  it('salta directorio vacío y lee el XML del CDR', async () => {
    const xml = new TextEncoder().encode('<cbc:ResponseCode>0</cbc:ResponseCode>');
    const zip = zipStoreFiles([
      { name: 'R-20612913251-01-F001-00000008/', content: new Uint8Array() },
      { name: 'R-20612913251-01-F001-00000008.xml', content: xml },
    ]);
    const out = await unzipFirstFile(zip);
    expect(out.name).toBe('R-20612913251-01-F001-00000008.xml');
    expect(new TextDecoder().decode(out.content)).toContain('ResponseCode>0<');
  });

  it('salta dummy/ DEFLATE cs=2 de Java y lee el XML siguiente', async () => {
    const xml = new TextEncoder().encode('<cbc:ResponseCode>0</cbc:ResponseCode>');
    const rest = zipStore('R-doc.xml', xml);
    const dummyName = new TextEncoder().encode('dummy/');
    const prefix = new Uint8Array(30 + dummyName.length + 2);
    const view = new DataView(prefix.buffer);
    prefix[0] = 0x50;
    prefix[1] = 0x4b;
    prefix[2] = 0x03;
    prefix[3] = 0x04;
    u16(view, 4, 20);
    u16(view, 6, 2);
    u16(view, 8, 8);
    u32(view, 18, 2);
    u32(view, 22, 0);
    u16(view, 26, dummyName.length);
    prefix.set(dummyName, 30);
    prefix[36] = 0x03;
    prefix[37] = 0x00;
    const zip = new Uint8Array(prefix.length + rest.length);
    zip.set(prefix);
    zip.set(rest, prefix.length);
    const out = await unzipFirstFile(zip);
    expect(out.name).toBe('R-doc.xml');
    expect(new TextDecoder().decode(out.content)).toContain('ResponseCode>0<');
  });

  it('ZIP solo local header (sin EOCD) aún lee el XML', async () => {
    const xml = new TextEncoder().encode('<cbc:ResponseCode>0</cbc:ResponseCode>');
    const full = zipStore('R.xml', xml);
    const nameLen = new DataView(full.buffer).getUint16(26, true);
    const localOnly = full.subarray(0, 30 + nameLen + xml.length);
    const out = await unzipFirstFile(localOnly);
    expect(new TextDecoder().decode(out.content)).toContain('ResponseCode>0<');
  });

  it('inflate JS (tiny-inflate) roundtrip de CompressionStream', async () => {
    const src = new TextEncoder().encode('<cbc:ResponseCode>0</cbc:ResponseCode>');
    const compressed = await deflateRaw(src);
    const out = inflateRawSync(compressed, new Uint8Array(4096));
    expect(new TextDecoder().decode(out)).toBe(new TextDecoder().decode(src));
  });

  it('DEFLATE con tamaños locales mentira (cs=2, us=0, flg=2) lee ResponseCode', async () => {
    const xml = new TextEncoder().encode(
      // eslint-disable-next-line no-secrets/no-secrets -- CDR XML fixture
      '<cbc:ResponseCode listAgencyName="PE:SUNAT">0</cbc:ResponseCode>',
    );
    const zip = await zipDeflateDataDescriptor('R.xml', xml);
    const copy = new Uint8Array(zip);
    const view = new DataView(copy.buffer);
    view.setUint16(6, 2, true);
    view.setUint32(18, 2, true);
    view.setUint32(22, 0, true);
    copy[copy.length - 22] = 0;
    const out = await unzipFirstFile(copy);
    expect(new TextDecoder().decode(out.content)).toContain('ResponseCode');
    expect(new TextDecoder().decode(out.content)).toContain('>0<');
  });
});
