import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePkcs12 } from './pkcs12.js';

function makeP12(args: string[], password: string): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'kp-rc2-legacy-'));
  try {
    const key = join(dir, 'k.pem');
    const cert = join(dir, 'c.pem');
    const p12 = join(dir, 't.p12');
    execFileSync('openssl', ['genrsa', '-out', key, '2048'], { stdio: 'pipe' });
    execFileSync(
      'openssl',
      [
        'req',
        '-new',
        '-x509',
        '-key',
        key,
        '-out',
        cert,
        '-days',
        '2',
        '-subj',
        '/CN=RC2 Legacy Test/O=Test/C=PE',
      ],
      { stdio: 'pipe' },
    );
    execFileSync(
      'openssl',
      [
        'pkcs12',
        '-export',
        '-inkey',
        key,
        '-in',
        cert,
        '-out',
        p12,
        '-passout',
        `pass:${password}`,
        ...args,
        '-legacy',
      ],
      { stdio: 'pipe' },
    );
    return new Uint8Array(readFileSync(p12));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('PKCS#12 RC2-40 legacy (SOL) — fallback vendorizado RFC2268', { timeout: 30000 }, () => {
  it('parsea p12 con cert RC2-40 (key 3DES + cert RC2) — caso SOL típico', async () => {
    const p12 = makeP12(
      ['-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-RC2-40'],
      'rc2-pass-legacy',
    );
    const parsed = await parsePkcs12(p12, 'rc2-pass-legacy');
    expect(parsed.pkcs8Der[0]).toBe(0x30);
    expect(parsed.certDer[0]).toBe(0x30);
    expect(parsed.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.certChainPem).toContain('BEGIN CERTIFICATE');
    // Verifica que la clave es importable (PKCS#8 válido tras descifrado RC2)
    const key = await crypto.subtle.importKey(
      'pkcs8',
      parsed.pkcs8Der.buffer.slice(
        parsed.pkcs8Der.byteOffset,
        parsed.pkcs8Der.byteOffset + parsed.pkcs8Der.byteLength,
      ) as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    expect(key).toBeDefined();
  });

  it('parsea p12 con ambos bags RC2-40 (key RC2 + cert RC2) — cobertura OID 1.2.840.113549.1.12.1.6', async () => {
    const p12 = makeP12(
      ['-keypbe', 'PBE-SHA1-RC2-40', '-certpbe', 'PBE-SHA1-RC2-40'],
      'rc2-both-pass',
    );
    const parsed = await parsePkcs12(p12, 'rc2-both-pass');
    expect(parsed.pkcs8Der[0]).toBe(0x30);
    expect(parsed.certDer[0]).toBe(0x30);
    expect(parsed.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.certChainPem).toContain('BEGIN CERTIFICATE');
  });

  it('rechaza password incorrecta para RC2-40 sin filtrar secreto en mensaje', async () => {
    const p12 = makeP12(['-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-RC2-40'], 'correct-rc2');
    await expect(parsePkcs12(p12, 'wrong-pass')).rejects.toThrow(/PKCS12_/);
    try {
      await parsePkcs12(p12, 'wrong-pass');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('correct-rc2');
      expect(msg).not.toContain('wrong-pass');
    }
  });
});
