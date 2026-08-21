import { describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '@kipuspay/domain-fiscal-pe';
import type { WorkerEnv } from '../auth/control-plane.js';
import { runWrapTenantDekHttp } from './tenant-cert-wrap-routes.js';

describe('runWrapTenantDekHttp', () => {
  it('fail-closed sin token / KMS; wrapDek con AAD tenant-cert:SUNAT', async () => {
    const dek = new Uint8Array(32).fill(9);
    const wrappedDek = new Uint8Array(60).fill(3);
    const wrapDek = vi.fn().mockResolvedValue({ wrappedDek, kekVersion: 'v1' });
    const env = {
      PLATFORM_STAFF_TOKEN: 'staff-secret',
      BACKUP_KMS: { wrapDek },
    } as WorkerEnv;

    const missing = await runWrapTenantDekHttp({} as WorkerEnv, 'x', {
      tenantId: 't1',
      dekB64: bytesToBase64(dek),
    });
    expect(missing.status).toBe(503);

    const unauth = await runWrapTenantDekHttp(env, 'nope', {
      tenantId: 't1',
      dekB64: bytesToBase64(dek),
    });
    expect(unauth.status).toBe(401);

    const ok = await runWrapTenantDekHttp(env, 'staff-secret', {
      tenantId: 'tenant_stg_rosa_negra_001',
      dekB64: bytesToBase64(dek),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.kekVersion).toBe('v1');
    expect(ok.body.backupId).toBe('tenant-cert:SUNAT');
    expect(wrapDek).toHaveBeenCalledTimes(1);
    const arg = wrapDek.mock.calls[0]?.[0] as {
      tenantId: string;
      backupId: string;
      dek: Uint8Array;
    };
    expect(arg.tenantId).toBe('tenant_stg_rosa_negra_001');
    expect(arg.backupId).toBe('tenant-cert:SUNAT');
    expect(arg.dek.byteLength).toBe(32);
  });

  it('sin BACKUP_KMS.wrapDek usa FISCAL.wrapTenantDek', async () => {
    const dek = new Uint8Array(32).fill(2);
    const wrapTenantDek = vi.fn().mockResolvedValue({
      wrappedDekB64: 'd3JhcA==',
      kekVersion: 'v1',
    });
    const ok = await runWrapTenantDekHttp(
      {
        PLATFORM_STAFF_TOKEN: 'staff-secret',
        FISCAL: {
          drain: () => Promise.resolve({}),
          produceMissing: () => Promise.resolve({}),
          wrapTenantDek,
        },
      } as WorkerEnv,
      'staff-secret',
      { tenantId: 't1', dekB64: bytesToBase64(dek) },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.wrappedDekB64).toBe('d3JhcA==');
    expect(wrapTenantDek).toHaveBeenCalledTimes(1);
  });
});
