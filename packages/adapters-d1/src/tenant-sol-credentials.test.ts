import { describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  randomDek,
  sealPkcs8WithDek,
  serializeTenantCertEnvelope,
} from '@kipuspay/domain-fiscal-pe';
import down0061 from '../migrations-down/0061_tenant_sol_credentials.sql?raw';
import migration0061 from '../migrations/0061_tenant_sol_credentials.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0061_TENANT_SOL_CREDENTIALS } from './migrations-down.js';
import {
  loadTenantSolCredentials,
  TENANT_SOL_BACKUP_ID,
  type TenantSolKms,
} from './tenant-sol-credentials.js';

/** D1 mínima en memoria: mapa (tenant_id, alias) → envelope. */
function memoryDb(rows: Map<string, string>): Parameters<typeof loadTenantSolCredentials>[0] {
  const prepare = (sql: string) => ({
    bind: (...params: unknown[]) => ({
      first: async <T>(): Promise<T | null> => {
        if (!sql.includes('FROM tenant_sol_credentials')) return null;
        const key = `${String(params[0])}:${String(params[1])}`;
        const envelope = rows.get(key);
        if (!envelope) return null;
        return {
          alias: params[1],
          sol_credentials_envelope: envelope,
        } as T;
      },
    }),
  });
  return { prepare } as unknown as Parameters<typeof loadTenantSolCredentials>[0];
}

/** KMS fake: wrap = identidad versionada; unwrap exige (tenantId, backupId) correctos. */
function memoryKms(expectedTenantId?: string): TenantSolKms & { wrapped: Uint8Array } {
  const deks = new Map<string, Uint8Array>();
  return {
    wrapped: new Uint8Array(0),
    async wrapDek({ tenantId, backupId, dek }) {
      deks.set(`${tenantId}:${backupId}`, dek);
      return { wrappedDek: new Uint8Array(dek), kekVersion: 'v1' };
    },
    async unwrapDek({ tenantId, backupId }) {
      if (expectedTenantId && tenantId !== expectedTenantId) {
        throw new Error('KMS_TENANT_MISMATCH');
      }
      const dek = deks.get(`${tenantId}:${backupId}`);
      if (!dek) throw new Error('KMS_DEK_NOT_FOUND');
      return new Uint8Array(dek);
    },
  };
}

async function sealEnvelope(input: {
  readonly tenantId: string;
  readonly kms: TenantSolKms;
  readonly payload: unknown;
}): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(input.payload));
  const dek = randomDek();
  const sealed = await sealPkcs8WithDek(dek, plaintext);
  if (!input.kms.wrapDek) throw new Error('fixture KMS sin wrapDek');
  const wrapped = await input.kms.wrapDek({
    tenantId: input.tenantId,
    backupId: TENANT_SOL_BACKUP_ID,
    dek,
  });
  return (
    'envelope-v1:' +
    serializeTenantCertEnvelope({
      kekVersion: wrapped.kekVersion,
      backupId: TENANT_SOL_BACKUP_ID,
      wrappedDekB64: bytesToBase64(wrapped.wrappedDek),
      nonceB64: bytesToBase64(sealed.nonce),
      ciphertextB64: bytesToBase64(sealed.ciphertext),
    })
  );
}

describe('tenant_sol_credentials schema (SOL por tenant)', () => {
  it('crea la tabla con envelope cifrado, UNIQUE(tenant_id, alias) y tenant_id NOT NULL', () => {
    expect(migration0061).toContain('CREATE TABLE tenant_sol_credentials');
    expect(migration0061).toContain('tenant_id TEXT NOT NULL');
    expect(migration0061).toContain("alias TEXT NOT NULL CHECK (alias = 'SUNAT')");
    expect(migration0061).toContain('sol_credentials_envelope TEXT NOT NULL');
    expect(migration0061).toContain('PRIMARY KEY (tenant_id, alias)');
    // El secreto jamás en claro: ninguna columna user/password plana.
    expect(migration0061).not.toMatch(/sol_user\s+TEXT/);
    expect(migration0061).not.toMatch(/sol_password\s+TEXT/);
  });

  it('registra SECRET en D1_BACKUP_TABLES y posee triggers de epoch insert/update/delete', () => {
    const entry = D1_BACKUP_TABLES.find((row) => row.name === 'tenant_sol_credentials');
    expect(entry?.classification).toBe('SECRET');
    expect(entry?.primaryKey).toEqual(['tenant_id', 'alias']);
    expect(migration0061).toContain('backup_epoch_tenant_sol_credentials_insert');
    expect(migration0061).toContain('backup_epoch_tenant_sol_credentials_update');
    expect(migration0061).toContain('backup_epoch_tenant_sol_credentials_delete');
  });

  it('down espejo protegido si hay filas (patrón V-25 / 0056)', () => {
    expect(DOWN_0061_TENANT_SOL_CREDENTIALS).toBe(down0061);
    expect(down0061).toContain('TENANT_SOL_DOWN_PROTECTED');
    expect(down0061).toContain('DROP TABLE tenant_sol_credentials');
    expect(down0061.indexOf('DROP TRIGGER')).toBeLessThan(down0061.indexOf('DROP TABLE'));
  });
});

describe('loadTenantSolCredentials (puerto de lectura SOL por tenant)', () => {
  it('envelope válido → {user, password} desenvelopado vía KMS', async () => {
    const kms = memoryKms('tenant_a');
    const rows = new Map<string, string>();
    rows.set(
      'tenant_a:SUNAT',
      await sealEnvelope({
        tenantId: 'tenant_a',
        kms,
        payload: { solUser: '20512345678MODDATOS', solPassword: 'sol-pass-tenant-a' },
      }),
    );
    const db = memoryDb(rows);
    await expect(loadTenantSolCredentials(db, kms, 'tenant_a')).resolves.toEqual({
      user: '20512345678MODDATOS',
      password: 'sol-pass-tenant-a',
    });
  });

  it('sin fila → null (fallback legítimo al env del worker)', async () => {
    const kms = memoryKms();
    const db = memoryDb(new Map());
    await expect(loadTenantSolCredentials(db, kms, 'tenant_sin_sol')).resolves.toBe(null);
  });

  it('ciphertext corrupto → TENANT_CERT_UNWRAP_FAILED (jamás credenciales parciales)', async () => {
    const kms = memoryKms('tenant_b');
    const raw = await sealEnvelope({
      tenantId: 'tenant_b',
      kms,
      payload: { solUser: 'u', solPassword: 'p' },
    });
    // Alterar el último byte del ciphertextB64 rompe el tag GCM.
    const parsed = JSON.parse(raw.slice('envelope-v1:'.length)) as { ciphertextB64: string };
    const flipped =
      parsed.ciphertextB64.slice(0, -2) +
      (parsed.ciphertextB64.endsWith('A') ? 'B' : 'A') +
      parsed.ciphertextB64.slice(-1);
    const corrupted = 'envelope-v1:' + JSON.stringify({ ...parsed, ciphertextB64: flipped });
    const rows = new Map<string, string>([['tenant_b:SUNAT', corrupted]]);
    await expect(loadTenantSolCredentials(memoryDb(rows), kms, 'tenant_b')).rejects.toThrow(
      /TENANT_CERT_UNWRAP_FAILED/,
    );
  });

  it('payload desenvelopado no-JSON o incompleto → TENANT_SOL_PAYLOAD_INVALID', async () => {
    const kms = memoryKms('tenant_c');
    const rows = new Map<string, string>();
    rows.set(
      'tenant_c:SUNAT',
      await sealEnvelope({ tenantId: 'tenant_c', kms, payload: { usuario: 'no-schema' } }),
    );
    await expect(loadTenantSolCredentials(memoryDb(rows), kms, 'tenant_c')).rejects.toThrow(
      /TENANT_SOL_PAYLOAD_INVALID/,
    );
  });
});
