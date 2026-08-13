/* eslint-disable no-secrets/no-secrets -- nombres canónicos de tablas DDL */
import { describe, expect, it } from 'vitest';
import down0046 from '../migrations-down/0046_sprint_p1b_remission_guide.sql?raw';
import migration0046 from '../migrations/0046_sprint_p1b_remission_guide.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0046_SPRINT_P1B_REMISSION_GUIDE } from './migrations-down.js';

describe('P1b GRE schema', () => {
  it('crea remission_guides con motivos catálogo 18 y modalidad cerrados', () => {
    expect(migration0046).toContain('CREATE TABLE remission_guides');
    expect(migration0046).toContain('transfer_reason_code IN');
    expect(migration0046).toContain('transport_mode_code IN');
    expect(migration0046).toContain('transfer_started_at TEXT NOT NULL');
    expect(migration0046).toContain('UNIQUE (tenant_id, series, number)');
  });

  it('crea remission_guide_items con cantidades en microunits > 0', () => {
    expect(migration0046).toContain('CREATE TABLE remission_guide_items');
    expect(migration0046).toContain(
      'quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0)',
    );
  });

  it('FK compuestas tenant + branch y tenant + producto (DAT-12)', () => {
    expect(migration0046).toContain(
      'FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)',
    );
    expect(migration0046).toContain(
      'FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)',
    );
  });

  it('tablas BUSINESS en el registry de backups con triggers de epoch insert/update/delete', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    const tables = ['remission_guides', 'remission_guide_items'];
    const epochTrigger = (table: string, op: string) => `backup_epoch_${table}_${op}`;
    for (const table of tables) {
      expect(registry.get(table)?.classification).toBe('BUSINESS');
      for (const op of ['insert', 'update', 'delete']) {
        expect(migration0046).toContain(epochTrigger(table, op));
      }
    }
  });

  it('down espejo: dropea tablas y triggers con guard contra guías no rechazadas', () => {
    expect(DOWN_0046_SPRINT_P1B_REMISSION_GUIDE).toBe(down0046);
    expect(down0046).toContain('GRE_DOWN_PROTECTED');
    expect(down0046).toContain('DROP TABLE remission_guides');
  });
});
