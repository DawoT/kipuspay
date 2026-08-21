import { describe, expect, it } from 'vitest';
import { encodePkcs12Password, pkcs12Kdf } from './pkcs12-kdf.js';

describe('pkcs12-kdf', () => {
  it('BMPString termina en NUL y el KDF es determinista', async () => {
    const bmp = encodePkcs12Password('ab');
    expect(bmp).toEqual(Uint8Array.of(0x00, 0x61, 0x00, 0x62, 0x00, 0x00));
    const salt = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    const a = await pkcs12Kdf(bmp, salt, 1, 24, 2);
    const b = await pkcs12Kdf(bmp, salt, 1, 24, 2);
    expect(a).toEqual(b);
    expect(a.byteLength).toBe(24);
    const iv = await pkcs12Kdf(bmp, salt, 2, 8, 2);
    expect(iv.byteLength).toBe(8);
    expect(iv).not.toEqual(a.subarray(0, 8));
  });

  it('KDF con salt vacío y pass BMP', async () => {
    const bmp = encodePkcs12Password('');
    const out = await pkcs12Kdf(bmp, new Uint8Array(), 3, 20, 1);
    expect(out.byteLength).toBe(20);
  });
});
