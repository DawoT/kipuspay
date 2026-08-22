import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerEnv } from '../auth/control-plane.js';
import { runGetTenantCertHttp, runUploadTenantCertHttp } from './tenant-cert-upload-routes.js';

/** Un solo PKCS#12 por worker: openssl genrsa bajo suite paralelo suele pasar de 5s. */
let cachedP12B64: string | null = null;

function makeP12B64(): string {
  if (cachedP12B64 !== null) return cachedP12B64;
  const dir = mkdtempSync(join(tmpdir(), 'kp-up-'));
  try {
    const key = join(dir, 'k.pem');
    const cert = join(dir, 'c.pem');
    const p12 = join(dir, 't.p12');
    execFileSync('openssl', ['genrsa', '-out', key, '2048'], { stdio: 'pipe' });
    execFileSync(
      'openssl',
      ['req', '-new', '-x509', '-key', key, '-out', cert, '-days', '2', '-subj', '/CN=Up/O=T/C=PE'],
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
        'pass:owner-pass',
        '-keypbe',
        'PBE-SHA1-3DES',
        '-certpbe',
        'PBE-SHA1-RC2-40',
        '-legacy',
      ],
      { stdio: 'pipe' },
    );
    const bytes = new Uint8Array(readFileSync(p12));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    cachedP12B64 = btoa(bin);
    return cachedP12B64;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('runUploadTenantCertHttp', () => {
  it(
    '403 cajero; 400 p12 inválido; 200 wrapDek + D1 sin persistir p12',
    { timeout: 20_000 },
    async () => {
    const wrapDek = vi.fn().mockResolvedValue({
      wrappedDek: new Uint8Array(48).fill(2),
      kekVersion: 'v1',
    });
    const batches: string[] = [];
    const env = {
      BACKUP_KMS: { wrapDek },
      DB: {
        prepare: () => ({
          bind: () => ({
            first: () => Promise.resolve(null),
            run: () => Promise.resolve({}),
          }),
        }),
        batch: (stmts: { toString?: () => string }[]) => {
          batches.push(String(stmts.length));
          return Promise.resolve([]);
        },
      },
    } as unknown as WorkerEnv;

    const cashier = await runUploadTenantCertHttp(env, 't1', 'cashier', {
      p12B64: 'AAAA',
      password: 'x',
    });
    expect(cashier.status).toBe(403);

    const bad = await runUploadTenantCertHttp(env, 't1', 'owner', {
      p12B64: btoa('not-a-p12-file-contents-xxxxxxxx'),
      password: 'x',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('PKCS12_INVALID');

    const p12B64 = makeP12B64();
    const ok = await runUploadTenantCertHttp(env, 't1', 'owner', {
      p12B64,
      password: 'owner-pass',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(ok.body)).not.toMatch(/BEGIN PRIVATE/);
    expect(wrapDek).toHaveBeenCalledTimes(1);
    expect(batches.length).toBe(1);

    const cashierGet = await runGetTenantCertHttp(env, 't1', 'cashier');
    expect(cashierGet.status).toBe(403);

    const listed = await runGetTenantCertHttp(env, 't1', 'owner');
    expect(listed.status).toBe(200);
    expect(listed.body.uploaded).toBe(false);
  });
});
