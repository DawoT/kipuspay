import { beforeAll, describe, expect, it, vi } from 'vitest';
import { D1_BACKUP_REGISTRY_VERSION } from '@kipuspay/adapters-d1';
import { runRestoreDryRunHttp } from './backup-routes.js';

const owner = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: 'owner',
  permissions: ['data.backup.restore_dry_run', 'data.backup.download'],
};

const token = 'stepup_restore_opaque_m2';

async function tokenHash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let tokenHashCached = '';
beforeAll(async () => {
  tokenHashCached = await tokenHash(token);
});

function makeDb(input: { readonly registryVersion?: string; readonly globalHash?: string } = {}) {
  const registry = input.registryVersion ?? D1_BACKUP_REGISTRY_VERSION;
  const hash = input.globalHash ?? 'a'.repeat(64);
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        first: vi.fn(() => {
          if (sql.includes('tenant_capabilities')) return Promise.resolve({ enabled: 1 });
          if (sql.includes('SELECT global_hash')) return Promise.resolve({ global_hash: hash });
          if (sql.includes('SELECT manifest_r2_key')) {
            return Promise.resolve({
              manifest_r2_key: 'ready/manifest.kpbk1',
              wrapped_dek: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
              kek_version: 'kek-1',
              schema_version: '0035',
              registry_version: registry,
              global_hash: hash,
            });
          }
          return Promise.resolve(null);
        }),
        all: vi.fn(() => Promise.resolve({ results: [] })),
        run: vi.fn(() => {
          if (sql.includes('UPDATE authorization_tokens')) {
            const h = params[2] as string;
            return Promise.resolve({ meta: { changes: h === tokenHashCached ? 1 : 0 } });
          }
          return Promise.resolve({ meta: { changes: 1 } });
        }),
      })),
    })),
    batch: vi.fn(() => Promise.resolve([])),
  } as unknown as never;
}

function makeEnv(db: unknown, kms: unknown) {
  return {
    FEATURE_DATA_BACKUP: '1',
    DB: db as never,
    BACKUPS: {
      get: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        customMetadata: {},
      }),
      head: vi.fn().mockResolvedValue({}),
    } as never,
    BACKUP_KMS: kms as never,
  };
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('OLA M2 — dry-run fail-closed 503 BACKUP_KMS_UNAVAILABLE', () => {
  it('runRestoreDryRunHttp con BACKUP_KMS down → 503 BACKUP_KMS_UNAVAILABLE (no 422), errorRef opaco, sin leak', async () => {
    const db = makeDb();
    const providerSecret = 'provider secret: kms_internal_hidden_detail_xyz';
    const kms = {
      unwrapDek: vi.fn().mockRejectedValue(new Error(providerSecret)),
      unwrap: vi.fn().mockRejectedValue(new Error(providerSecret)),
    };
    const env = makeEnv(db, kms);

    const result = await runRestoreDryRunHttp(env, owner, {
      backupId: 'backup-ready',
      idempotencyKey: 'dry-m2-kms-down',
      stepUpToken: token,
    });

    expect(result.status).toBe(503);
    expect(result.status).not.toBe(422);
    const body = result.body as Record<string, unknown>;
    expect(body.code).toBe('BACKUP_KMS_UNAVAILABLE');
    expect(typeof body.errorRef).toBe('string');
    expect(String(body.errorRef)).toMatch(uuidRe);
    // no leak: provider secret or wrapped details must not appear in serialized body
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('provider secret');
    expect(serialized).not.toContain('kms_internal');
    expect(serialized).not.toContain('hidden_detail');
    // also check whole result not leaking
    expect(JSON.stringify(result)).not.toContain('provider secret');
  });

  it('sigue devolviendo 422 para errores de validación no-KMS (no convierte todo en 503)', async () => {
    // Usa registry stale para provocar un error de validación que debe mapearse a 422, no 503.
    const db = makeDb({ registryVersion: 'registry-1' });
    const kms = {
      unwrapDek: vi.fn().mockResolvedValue(new Uint8Array(32)),
      unwrap: vi.fn().mockResolvedValue(new Uint8Array(32)),
    };
    const env = makeEnv(db, kms);

    const result = await runRestoreDryRunHttp(env, owner, {
      backupId: 'backup-ready',
      idempotencyKey: 'dry-m2-not-kms',
      stepUpToken: token,
    });

    expect(result.status).toBe(422);
    expect(result.status).not.toBe(503);
    const body = result.body as Record<string, unknown>;
    // allowlist: registry stale → RESTORE_VERIFY_FAILED (opaque), pero debe ser 422 con errorRef
    expect(typeof body.code).toBe('string');
    expect(typeof body.errorRef).toBe('string');
    expect(String(body.errorRef)).toMatch(uuidRe);
    expect(body.code).not.toBe('BACKUP_KMS_UNAVAILABLE');
    // no debe exponer detalles internos del registry mismatch
    expect(JSON.stringify(body)).not.toContain('registry-1');
    expect(JSON.stringify(body)).not.toContain(D1_BACKUP_REGISTRY_VERSION);
  });
});
