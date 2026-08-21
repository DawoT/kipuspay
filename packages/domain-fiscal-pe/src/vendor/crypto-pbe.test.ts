import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decrypt3DesCbc } from './des-ede3.js';
import { decryptRc2Cbc } from './rc2.js';

describe('PBE vendorizado (3DES / RC2)', () => {
  it('3DES-EDE-CBC openssl → decrypt3DesCbc', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kp-3des-'));
    try {
      const key = '00112233445566778899aabbccddeeff0011223344556677';
      const iv = '0102030405060708';
      const plain = join(dir, 'p.bin');
      const cipher = join(dir, 'c.bin');
      writeFileSync(plain, 'hello-p12');
      execFileSync(
        'openssl',
        ['enc', '-des-ede3-cbc', '-K', key, '-iv', iv, '-in', plain, '-out', cipher],
        { stdio: 'pipe' },
      );
      const key24 = Uint8Array.from(key.match(/../g)!.map((h) => Number.parseInt(h, 16)));
      const iv8 = Uint8Array.from(iv.match(/../g)!.map((h) => Number.parseInt(h, 16)));
      const out = decrypt3DesCbc(key24, iv8, new Uint8Array(readFileSync(cipher)));
      expect(new TextDecoder().decode(out)).toBe('hello-p12');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rechaza tamaños inválidos y padding 3DES', () => {
    expect(() => decrypt3DesCbc(new Uint8Array(8), new Uint8Array(8), new Uint8Array(8))).toThrow(
      /PKCS12_3DES/,
    );
    expect(() => decryptRc2Cbc(new Uint8Array(5), 40, new Uint8Array(7), new Uint8Array(8))).toThrow(
      /PKCS12_RC2/,
    );
    const key24 = new Uint8Array(24).fill(0x11);
    const iv8 = new Uint8Array(8).fill(0x22);
    expect(() => decrypt3DesCbc(key24, iv8, new Uint8Array(8).fill(0xff))).toThrow(/PKCS12_PADDING/);
    expect(() => decryptRc2Cbc(new Uint8Array(5).fill(1), 40, iv8, new Uint8Array(8).fill(0xff))).toThrow(
      /PKCS12_PADDING/,
    );
  });
});
