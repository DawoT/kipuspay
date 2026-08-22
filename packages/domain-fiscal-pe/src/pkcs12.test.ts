import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePkcs12 } from './pkcs12.js';

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function makeLegacyP12(): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'kp-p12-'));
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
        '/CN=KipusPay Test CDT/O=Test/C=PE',
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
        'pass:test-pass-ok',
        '-keypbe',
        'PBE-SHA1-3DES',
        '-certpbe',
        'PBE-SHA1-RC2-40',
        '-legacy',
      ],
      { stdio: 'pipe' },
    );
    return new Uint8Array(readFileSync(p12));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('PKCS#12 CDT (Worker, no npm)', () => {
  it('rechaza pass incorrecta de un PFX openssl legado', { timeout: 20_000 }, async () => {
    const p12 = makeLegacyP12();
    await expect(parsePkcs12(p12, 'wrong-pass')).rejects.toThrow(/PKCS12_/);
  });

  it('extrae PKCS#8 y X.509 de un PFX openssl 3DES+RC2', { timeout: 20_000 }, async () => {
    const p12 = makeLegacyP12();
    const parsed = await parsePkcs12(p12, 'test-pass-ok');
    expect(parsed.pkcs8Der[0]).toBe(0x30);
    expect(parsed.certDer[0]).toBe(0x30);
    expect(parsed.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.certChainPem).toContain('BEGIN CERTIFICATE');
    expect(parsed.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const key = await crypto.subtle.importKey(
      'pkcs8',
      asBuffer(parsed.pkcs8Der),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    expect(key).toBeDefined();
  });

  it('rechaza PFX demasiado pequeño', async () => {
    await expect(parsePkcs12(new Uint8Array(8), 'x')).rejects.toThrow(/PKCS12_TOO_SMALL/);
  });

  it('abre PFX openssl 3 PBES2 AES (sin -legacy)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kp-p12-aes-'));
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
          '/CN=Aes/O=T/C=PE',
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
          'pass:aes-pass-ok',
        ],
        { stdio: 'pipe' },
      );
      const parsed = await parsePkcs12(new Uint8Array(readFileSync(p12)), 'aes-pass-ok');
      expect(parsed.certChainPem).toContain('BEGIN CERTIFICATE');
      expect(parsed.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('abre PFX AES-128-CBC y certificado GeneralizedTime', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kp-p12-g-'));
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
          '20000',
          '-subj',
          '/CN=Far/O=T/C=PE',
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
          'pass:aes128-ok',
          '-keypbe',
          'AES-128-CBC',
          '-certpbe',
          'AES-128-CBC',
        ],
        { stdio: 'pipe' },
      );
      const parsed = await parsePkcs12(new Uint8Array(readFileSync(p12)), 'aes128-ok');
      expect(parsed.expiresAt.startsWith('20')).toBe(true);
      expect(parsed.pkcs8Der[0]).toBe(0x30);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rechaza PFX versión distinta de 3', async () => {
    const fake = new Uint8Array(40);
    fake[0] = 0x30;
    fake[1] = 38;
    fake[2] = 0x02;
    fake[3] = 0x01;
    fake[4] = 0x01;
    await expect(parsePkcs12(fake, 'x')).rejects.toThrow(/PKCS12_/);
  });

  it('rechaza ContentInfo incompleto y SafeContents vacío', async () => {
    const oidData = Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01);
    const onlyOid = Uint8Array.of(0x30, 0x0b, 0x02, 0x01, 0x03, ...oidData);
    const paddedOid = new Uint8Array(40);
    paddedOid.set(onlyOid);
    paddedOid[1] = 38;
    await expect(parsePkcs12(paddedOid, 'x')).rejects.toThrow(/PKCS12_/);

    const content = Uint8Array.of(
      0x30,
      0x16,
      0x02,
      0x01,
      0x03,
      0x30,
      0x11,
      ...oidData,
      0x04,
      0x04,
      0x30,
      0x02,
      0x05,
      0x00,
    );
    const padded = new Uint8Array(40);
    padded.set(content);
    padded[1] = 38;
    await expect(parsePkcs12(padded, 'x')).rejects.toThrow(/PKCS12_/);
  });

  it('abre keyBag sin shroud (openssl NONE)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kp-p12-none-'));
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
          '/CN=None/O=T/C=PE',
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
          'pass:none-pass',
          '-keypbe',
          'NONE',
          '-certpbe',
          'PBE-SHA1-RC2-40',
          '-legacy',
        ],
        { stdio: 'pipe' },
      );
      const parsed = await parsePkcs12(new Uint8Array(readFileSync(p12)), 'none-pass');
      expect(parsed.certChainPem).toContain('BEGIN CERTIFICATE');
      expect(parsed.pkcs8Der.byteLength).toBeGreaterThan(8);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
