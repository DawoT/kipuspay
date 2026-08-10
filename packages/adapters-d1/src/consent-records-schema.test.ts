/* eslint-disable no-secrets/no-secrets -- versioned SQL identifiers */
import { describe, expect, it } from 'vitest';
import down0040 from '../migrations-down/0040_sprint47_lpdp_consent.sql?raw';
import migration0040 from '../migrations/0040_sprint47_lpdp_consent.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0040_SPRINT47_LPDP_CONSENT } from './migrations-down.js';

describe('Sprint 47 LPDP consent schema', () => {
  it('defines consent_records by purpose with DAT-12 tenancy and immutable grants', () => {
    expect(migration0040).toContain('CREATE TABLE consent_records');
    expect(migration0040).toContain('UNIQUE (tenant_id, id)');
    expect(migration0040).toContain('UNIQUE (tenant_id, customer_id, purpose)');
    expect(migration0040).toContain('FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)');
    expect(migration0040).toMatch(/granted INTEGER NOT NULL DEFAULT 0/);
    expect(migration0040).toContain('granted_at DATETIME');
    expect(migration0040).toContain('revoked_at DATETIME');
    expect(migration0040).toMatch(/CHECK \(granted IN \(0, 1\)\)/);
  });

  it('migrates the Sprint 24 messaging opt-in as consent by purpose (LPDP-01)', () => {
    expect(migration0040).toContain('FROM messaging_opt_ins');
    expect(migration0040).toContain("'messaging_whatsapp'");
    expect(migration0040).toContain('WHERE opted_in = 1');
  });

  it('registers consent_records as BUSINESS and owns 0040 epoch triggers', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    const consent = registry.get('consent_records');
    expect(consent).toBeDefined();
    expect(consent).toMatchObject({ classification: 'BUSINESS' });
    expect(migration0040).toContain('backup_epoch_consent_records_insert');
    expect(migration0040).toContain('backup_epoch_consent_records_update');
    expect(migration0040).toContain('backup_epoch_consent_records_delete');
  });

  it('exports an exact protected child-first down mirror', () => {
    expect(DOWN_0040_SPRINT47_LPDP_CONSENT.trim()).toBe(down0040.trim());
    expect(down0040).toContain('CONSENT_DOWN_PROTECTED');
    expect(down0040.indexOf('DROP TABLE consent_records')).toBeGreaterThan(
      down0040.indexOf('DROP INDEX IF EXISTS idx_consent_records_tenant_customer'),
    );
    expect(down0040).toContain('DELETE FROM schema_meta WHERE key = \'compliance.lpdp.sprint47\'');
  });
});
