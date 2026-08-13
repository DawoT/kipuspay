/* eslint-disable no-secrets/no-secrets -- nombres canónicos de tablas DDL */
import { describe, expect, it } from 'vitest';
import down0043 from '../migrations-down/0043_sprint51_shift_handoff.sql?raw';
import migration0043 from '../migrations/0043_sprint51_shift_handoff.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0043_SPRINT51_SHIFT_HANDOFF } from './migrations-down.js';

describe('Sprint 51 shift handoff schema', () => {
  it('crea cash_register_shifts con atribución por operador y tramo', () => {
    expect(migration0043).toContain('CREATE TABLE cash_register_shifts');
    expect(migration0043).toContain('tenant_id TEXT NOT NULL');
    expect(migration0043).toContain('user_id TEXT NOT NULL');
    expect(migration0043).toContain('transfer_pin_hash TEXT');
    expect(migration0043).toContain('transfer_pin_expires_at DATETIME');
    expect(migration0043).toContain('interim_count_cents INTEGER');
    expect(migration0043).toContain('cash_diff_cents INTEGER');
  });

  it('FK compuesta tenant + sesión (DAT-12, patrón 0033) y tenant + operador', () => {
    expect(migration0043).toContain(
      'FOREIGN KEY (tenant_id, cash_register_session_id) REFERENCES cash_register_sessions(tenant_id, id)',
    );
    expect(migration0043).toContain(
      'FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id)',
    );
  });

  it('extiende users con pin_hash y la política con interim_required (default off)', () => {
    expect(migration0043).toContain('ALTER TABLE users ADD COLUMN pin_hash TEXT');
    expect(migration0043).toContain(
      'ALTER TABLE tenant_discount_policies ADD COLUMN interim_required INTEGER NOT NULL DEFAULT 0',
    );
  });

  it('cash_register_shifts es BUSINESS (con backups, no derivado) en el registry', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('cash_register_shifts')?.classification).toBe('BUSINESS');
  });

  it('down espejo: dropea tabla, columnas y triggers de epoch', () => {
    expect(DOWN_0043_SPRINT51_SHIFT_HANDOFF).toBe(down0043);
    expect(down0043).toContain('SHIFTHANDOFF_DOWN_PROTECTED');
    expect(down0043).toContain('DROP TABLE cash_register_shifts');
    expect(down0043).toContain('ALTER TABLE users DROP COLUMN pin_hash');
    expect(down0043).toContain('ALTER TABLE tenant_discount_policies DROP COLUMN interim_required');
    expect(down0043).toContain('DROP TRIGGER IF EXISTS backup_epoch_cash_register_shifts_insert');
  });
});
