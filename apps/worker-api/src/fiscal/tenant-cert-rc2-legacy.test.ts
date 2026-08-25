import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerEnv } from '../auth/control-plane.js';
import { runUploadTenantCertHttp } from './tenant-cert-upload-routes.js';

const RUC_TENANT = '20123456789';

function cdtSubject(ruc: string): string {
  return `/CN=RC2 Legacy SAC/O=Test/organizationIdentifier=NTRPE-${ruc}/OU=${ruc}/OU=USO TRIBUTARIO/C=PE`;
}

let sharedKey: string | null = null;
function getKey(): string {
  if (!sharedKey) {
    const d = mkdtempSync(join(tmpdir(), 'kp-rc2-up-'));
    const kp = join(d, 'k.pem');
    try {
      execFileSync('openssl', ['genrsa', '-out', kp, '2048'], { stdio: 'pipe' });
      sharedKey = readFileSync(kp, 'utf8');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }
  return sharedKey;
}

function makeP12B64(subj: string, pass: string, keyPbe: string, certPbe: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kp-rc2-up2-'));
  try {
    const key = join(dir, 'k.pem');
    const cert = join(dir, 'c.pem');
    const p12 = join(dir, 't.p12');
    writeFileSync(key, getKey(), 'utf8');
    execFileSync(
      'openssl',
      ['req', '-new', '-x509', '-key', key, '-out', cert, '-days', '300', '-subj', subj],
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
        `pass:${pass}`,
        '-keypbe',
        keyPbe,
        '-certpbe',
        certPbe,
        '-legacy',
      ],
      { stdio: 'pipe' },
    );
    const bytes = new Uint8Array(readFileSync(p12));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fakeDb() {
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        first: () => {
          if (sql.includes('FROM tenants')) return Promise.resolve({ ruc: RUC_TENANT });
          if (sql.includes('FROM tenant_certificates')) return Promise.resolve(null);
          return Promise.resolve(null);
        },
        run: () => Promise.resolve({}),
      }),
      first: () => Promise.resolve(null),
      all: () => Promise.resolve({ results: [] }),
      run: () => Promise.resolve({}),
    }),
    batch: () => Promise.resolve([]),
  };
  return db as unknown as WorkerEnv['DB'];
}

describe(
  'tenant-cert upload RC2-40 legacy (OID 1.2.840.113549.1.12.1.6) — fallback vendorizado',
  { timeout: 30000 },
  () => {
    it('upload 200 con p12 sintético RC2-40 (openssl -legacy) — parse OK', async () => {
      const p12B64 = makeP12B64(
        cdtSubject(RUC_TENANT),
        'rc2-pass-ok',
        'PBE-SHA1-3DES',
        'PBE-SHA1-RC2-40',
      );
      const wrapDek = vi
        .fn()
        .mockResolvedValue({ wrappedDek: new Uint8Array(48).fill(7), kekVersion: 'v1' });
      const env = { BACKUP_KMS: { wrapDek }, DB: fakeDb() } as unknown as WorkerEnv;
      const res = await runUploadTenantCertHttp(env, 't1', 'owner', {
        p12B64,
        password: 'rc2-pass-ok',
      });
      expect(res.status).toBe(200);
      expect(res.body.uploaded).toBe(true);
      expect(res.body.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(res.body)).not.toMatch(/BEGIN PRIVATE/);
      expect(wrapDek).toHaveBeenCalledTimes(1);
      // No secret en cuerpo de respuesta
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('rc2-pass-ok');
      expect(bodyStr).not.toContain(p12B64.slice(0, 10));
    });

    it('upload 200 con ambos bags RC2-40 (key RC2 + cert RC2) — OID 1.2.840.113549.1.12.1.6 doble', async () => {
      const p12B64 = makeP12B64(
        cdtSubject(RUC_TENANT),
        'rc2-both-ok',
        'PBE-SHA1-RC2-40',
        'PBE-SHA1-RC2-40',
      );
      const wrapDek = vi
        .fn()
        .mockResolvedValue({ wrappedDek: new Uint8Array(48).fill(7), kekVersion: 'v1' });
      const env = { BACKUP_KMS: { wrapDek }, DB: fakeDb() } as unknown as WorkerEnv;
      const res = await runUploadTenantCertHttp(env, 't1', 'owner', {
        p12B64,
        password: 'rc2-both-ok',
      });
      expect(res.status).toBe(200);
      expect(res.body.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('400 con password incorrecta — no filtra secreto, no llama KMS', async () => {
      const p12B64 = makeP12B64(
        cdtSubject(RUC_TENANT),
        'correct-pass',
        'PBE-SHA1-3DES',
        'PBE-SHA1-RC2-40',
      );
      const wrapDek = vi.fn();
      const env = { BACKUP_KMS: { wrapDek }, DB: fakeDb() } as unknown as WorkerEnv;
      const res = await runUploadTenantCertHttp(env, 't1', 'owner', {
        p12B64,
        password: 'wrong-pass',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PKCS12_INVALID');
      expect(wrapDek).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain('correct-pass');
      expect(JSON.stringify(res.body)).not.toContain('wrong-pass');
    });
  },
);
