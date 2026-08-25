import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerEnv } from '../auth/control-plane.js';
import { runGetTenantCertHttp, runUploadTenantCertHttp } from './tenant-cert-upload-routes.js';

const RUC_TENANT = '20123456789'; // RUC registrado del tenant uploader
const RUC_AJENO = '20987654321'; // RUC de otro negocio (ataque A1)

/** Subject con el patrón del CDT real de SUNAT. El CN es libre; la identidad
 * vive en organizationIdentifier «NTRPE-<RUC>» y OU (más el marcador de uso). */
function cdtSubject(ruc: string, usoTributario = true): string {
  const ous = usoTributario ? `${ruc}/OU=USO TRIBUTARIO` : ruc;
  return `/CN=Biz SAC/O=BIZ/organizationIdentifier=NTRPE-${ruc}/OU=${ous}/C=PE`;
}

const p12Cache = new Map<string, string>();

/** Un PKCS#12 por spec (openssl genrsa bajo suite paralelo suele pasar de 5s). */
function makeP12B64(subj: string, validity?: { notBefore?: string; notAfter?: string }): string {
  const cacheKey = `${subj}|${validity?.notBefore ?? ''}|${validity?.notAfter ?? ''}`;
  const cached = p12Cache.get(cacheKey);
  if (cached) return cached;
  const dir = mkdtempSync(join(tmpdir(), 'kp-up-'));
  try {
    const key = join(dir, 'k.pem');
    const cert = join(dir, 'c.pem');
    const p12 = join(dir, 't.p12');
    execFileSync('openssl', ['genrsa', '-out', key, '2048'], { stdio: 'pipe' });
    const reqArgs = ['req', '-new', '-x509', '-key', key, '-out', cert];
    if (validity?.notAfter) {
      reqArgs.push('-not_before', validity.notBefore ?? '20260101000000Z');
      reqArgs.push('-not_after', validity.notAfter);
    } else {
      reqArgs.push('-days', '300');
    }
    reqArgs.push('-subj', subj);
    execFileSync('openssl', reqArgs, { stdio: 'pipe' });
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
    const b64 = btoa(bin);
    p12Cache.set(cacheKey, b64);
    return b64;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** D1 fake: ruc del tenant + cert existente por SQL; captura batches. */
function fakeDb(options: { ruc?: string | null; existingCertId?: string | null }) {
  const batches: number[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        first: () => {
          if (sql.includes('FROM tenants')) {
            return Promise.resolve(options.ruc ? { ruc: options.ruc } : null);
          }
          if (sql.includes('FROM tenant_certificates')) {
            return Promise.resolve(options.existingCertId ? { id: options.existingCertId } : null);
          }
          return Promise.resolve(null);
        },
        run: () => Promise.resolve({}),
      }),
      first: () => Promise.resolve(null),
      all: () => Promise.resolve({ results: [] }),
      run: () => Promise.resolve({}),
    }),
    batch: (stmts: { toString?: () => string }[]) => {
      batches.push(stmts.length);
      return Promise.resolve([]);
    },
  };
  return { db: db as unknown as WorkerEnv['DB'], batches };
}

function envWith(db: WorkerEnv['DB'], wrapDek: ReturnType<typeof vi.fn>): WorkerEnv {
  return { BACKUP_KMS: { wrapDek }, DB: db } as unknown as WorkerEnv;
}

describe('runUploadTenantCertHttp — validación fail-closed SEC-03', () => {
  it(
    'A1: p12 de OTRO RUC → 400 CERT_RUC_MISMATCH antes de KMS/D1',
    { timeout: 20_000 },
    async () => {
      const wrapDek = vi.fn();
      const { db, batches } = fakeDb({ ruc: RUC_TENANT });
      const res = await runUploadTenantCertHttp(envWith(db, wrapDek), 't1', 'owner', {
        p12B64: makeP12B64(cdtSubject(RUC_AJENO)),
        password: 'owner-pass',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CERT_RUC_MISMATCH');
      expect(wrapDek).not.toHaveBeenCalled();
      expect(batches).toEqual([]);
      expect(JSON.stringify(res.body)).not.toMatch(/BEGIN PRIVATE/);
    },
  );

  it('A2: p12 vencido → 400 CERT_EXPIRED', { timeout: 20_000 }, async () => {
    const wrapDek = vi.fn();
    const { db, batches } = fakeDb({ ruc: RUC_TENANT });
    const res = await runUploadTenantCertHttp(envWith(db, wrapDek), 't1', 'owner', {
      p12B64: makeP12B64(cdtSubject(RUC_TENANT), {
        notBefore: '20260101000000Z',
        notAfter: '20260201000000Z',
      }),
      password: 'owner-pass',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CERT_EXPIRED');
    expect(wrapDek).not.toHaveBeenCalled();
    expect(batches).toEqual([]);
  });

  it(
    'A3: p12 sin USO TRIBUTARIO en el subject → 400 CERT_USO_INVALIDO',
    { timeout: 20_000 },
    async () => {
      const wrapDek = vi.fn();
      const { db, batches } = fakeDb({ ruc: RUC_TENANT });
      const res = await runUploadTenantCertHttp(envWith(db, wrapDek), 't1', 'owner', {
        p12B64: makeP12B64(cdtSubject(RUC_TENANT, false)),
        password: 'owner-pass',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CERT_USO_INVALIDO');
      expect(wrapDek).not.toHaveBeenCalled();
      expect(batches).toEqual([]);
    },
  );

  it('fail-closed: tenant sin RUC registrado → 400 CERT_TENANT_NO_RUC', async () => {
    const wrapDek = vi.fn();
    const { db, batches } = fakeDb({ ruc: null });
    const res = await runUploadTenantCertHttp(envWith(db, wrapDek), 't1', 'owner', {
      p12B64: makeP12B64(cdtSubject(RUC_TENANT)),
      password: 'owner-pass',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CERT_TENANT_NO_RUC');
    expect(wrapDek).not.toHaveBeenCalled();
    expect(batches).toEqual([]);
  });

  it(
    'sin marcador de RUC en el subject (CN libre) → 400 CERT_RUC_MISMATCH',
    { timeout: 20_000 },
    async () => {
      const wrapDek = vi.fn();
      const { db } = fakeDb({ ruc: RUC_TENANT });
      const res = await runUploadTenantCertHttp(envWith(db, wrapDek), 't1', 'owner', {
        p12B64: makeP12B64('/CN=20123456789/O=BIZ/C=PE'),
        password: 'owner-pass',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CERT_RUC_MISMATCH');
    },
  );
});

describe('runUploadTenantCertHttp', () => {
  it(
    '403 cajero; 400 p12 inválido; 200 wrapDek + D1 sin persistir p12 (CDT válido)',
    { timeout: 20_000 },
    async () => {
      const wrapDek = vi.fn().mockResolvedValue({
        wrappedDek: new Uint8Array(48).fill(2),
        kekVersion: 'v1',
      });
      const { db, batches } = fakeDb({ ruc: RUC_TENANT });
      const env = envWith(db, wrapDek);

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

      const p12B64 = makeP12B64(cdtSubject(RUC_TENANT));
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
    },
  );
});
