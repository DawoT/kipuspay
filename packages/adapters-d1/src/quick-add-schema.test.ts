import { describe, expect, it } from 'vitest';
import down0042 from '../migrations-down/0042_sprint50_quick_add.sql?raw';
import migration0042 from '../migrations/0042_sprint50_quick_add.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0042_SPRINT50_QUICK_ADD } from './migrations-down.js';

describe('Sprint 50 quick-add schema', () => {
  it('añade badge_barcode de usuario con índice único por tenant', () => {
    expect(migration0042).toContain('ALTER TABLE users ADD COLUMN badge_barcode TEXT');
    expect(migration0042).toContain('uq_users_badge_barcode');
    expect(migration0042).toContain('WHERE badge_barcode IS NOT NULL');
  });

  it('índice único de barcode de producto excluye el namespace EMP- (edge 1A)', () => {
    expect(migration0042).toContain('uq_products_barcode_tenant');
    expect(migration0042).toContain("barcode NOT LIKE 'EMP-%'");
  });

  it('users y products permanecen BUSINESS en el registry', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('users')?.classification).toBe('SECRET');
    expect(registry.get('products')?.classification).toBe('BUSINESS');
  });

  it('down espejo: dropea índices y columna', () => {
    expect(DOWN_0042_SPRINT50_QUICK_ADD).toBe(down0042);
    expect(down0042).toContain('QUICKADD_DOWN_PROTECTED');
    expect(down0042).toContain('DROP INDEX IF EXISTS uq_products_barcode_tenant');
    expect(down0042).toContain('ALTER TABLE users DROP COLUMN badge_barcode');
  });
});
