/* eslint-disable no-secrets/no-secrets -- nombres canónicos de tablas DDL */
import { describe, expect, it } from 'vitest';
import down0047 from '../migrations-down/0047_sprint_p1c_withholdings.sql?raw';
import migration0047 from '../migrations/0047_sprint_p1c_withholdings.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0047_SPRINT_P1C_WITHHOLDINGS } from './migrations-down.js';

describe('P1c withholdings schema', () => {
  it('crea perceptions y retentions con serie/número propios y montos en cents', () => {
    expect(migration0047).toContain('CREATE TABLE perceptions');
    expect(migration0047).toContain('CREATE TABLE retentions');
    expect(migration0047).toContain('base_amount_cents INTEGER NOT NULL CHECK (base_amount_cents > 0)');
    expect(migration0047).toContain('UNIQUE (tenant_id, series, number)');
    expect(migration0047).toContain('origin_sale_id TEXT NOT NULL');
  });

  it('withholding_parameters con tasas cerradas (1..1200 basis points)', () => {
    expect(migration0047).toContain('CREATE TABLE withholding_parameters');
    expect(migration0047).toContain("CHECK (scheme IN ('PERCEPTION','RETENTION','DETRACTION'))");
    expect(migration0047).toContain('rate_percentage INTEGER NOT NULL CHECK (rate_percentage BETWEEN 1 AND 1200)');
  });

  it('no recrea sales: CHECK original intacto en 0001', () => {
    expect(migration0047).not.toContain('CREATE TABLE sales_v');
    expect(migration0047).not.toContain('ALTER TABLE sales');
  });

  it('tablas BUSINESS en el registry con triggers de epoch', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('perceptions')?.classification).toBe('BUSINESS');
    expect(registry.get('retentions')?.classification).toBe('BUSINESS');
    expect(migration0047).toContain('backup_epoch_perceptions_insert');
    expect(migration0047).toContain('backup_epoch_retentions_insert');
  });

  it('down espejo con guard contra comprobantes no rechazados', () => {
    expect(DOWN_0047_SPRINT_P1C_WITHHOLDINGS).toBe(down0047);
    expect(down0047).toContain('WITHHOLDINGS_DOWN_PROTECTED');
    expect(down0047).toContain('DROP TABLE perceptions');
    expect(down0047).toContain('DROP TABLE withholding_parameters');
  });
});
