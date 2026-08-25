import { describe, expect, it } from 'vitest';
import down0056 from '../migrations-down/0056_tenant_certificates.sql?raw';
import migration0056 from '../migrations/0056_tenant_certificates.sql?raw';
import { D1_BACKUP_REGISTRY_VERSION, D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0056_TENANT_CERTIFICATES } from './migrations-down.js';

describe('tenant_certificates schema (FIS-T1)', () => {
  it('crea tenant_certificates con kms_ref y sin columna de clave privada', () => {
    expect(migration0056).toContain('CREATE TABLE tenant_certificates');
    expect(migration0056).toContain('private_key_kms_ref TEXT NOT NULL');
    expect(migration0056).toContain("alias IN ('SUNAT', 'PSE_PLATFORM')");
    expect(migration0056).toContain('UNIQUE (tenant_id, alias)');
    expect(migration0056).toContain('UNIQUE (tenant_id, id)');
    expect(migration0056).not.toContain('private_key_pem');
    expect(migration0056).not.toContain('p12');
  });

  it('registra SECRET y posee triggers de epoch insert/update/delete', () => {
    expect(D1_BACKUP_REGISTRY_VERSION).toBe('registry-3');
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('tenant_certificates')?.classification).toBe('SECRET');
    expect(migration0056).toContain('backup_epoch_tenant_certificates_insert');
    expect(migration0056).toContain('backup_epoch_tenant_certificates_update');
    expect(migration0056).toContain('backup_epoch_tenant_certificates_delete');
  });

  it('down espejo protegido si hay filas', () => {
    expect(DOWN_0056_TENANT_CERTIFICATES).toBe(down0056);
    expect(down0056).toContain('TENANT_CERT_DOWN_PROTECTED');
    expect(down0056).toContain('DROP TABLE tenant_certificates');
  });
});
