import { describe, expect, it } from 'vitest';
import {
  validateRestoreValue,
  verifyRestoreAuditChain,
  type RestoreColumn,
  type RestoreAuditRow,
} from './data-backup.js';

// RED/GREEN (S48 DR): BOOLEAN se almacena 0/1 en SQLite; el validador lo trataba
// como string y tumbaba la restauración DR de toda tabla con booleanos
// (branches.is_active fue el primer caso real en staging).
describe('validateRestoreValue: columnas BOOLEAN', () => {
  const col = (type: string, notNull = true): Readonly<Record<string, RestoreColumn>> => ({
    is_active: { type, notNull },
  });

  it('BOOLEAN acepta enteros 0/1 (convención SQLite del DDL propio)', () => {
    expect(() => validateRestoreValue('branches', { is_active: 1 }, col('BOOLEAN'))).not.toThrow();
    expect(() => validateRestoreValue('branches', { is_active: 0 }, col('BOOLEAN'))).not.toThrow();
  });

  it('BOOLEAN rechaza strings, otros enteros y flotantes (fail-closed)', () => {
    for (const bad of ['true', '1', '0', 2, -1, 1.5]) {
      expect(() =>
        validateRestoreValue('branches', { is_active: bad as unknown as number }, col('BOOLEAN')),
      ).toThrow('BACKUP_TYPE_INVALID');
    }
  });

  it('BOOLEAN NOT NULL rechaza null/undefined; nullable los acepta', () => {
    const nulos = [null, undefined];
    for (const v of nulos) {
      expect(() =>
        validateRestoreValue('branches', { is_active: v as unknown as number }, col('BOOLEAN')),
      ).toThrow('BACKUP_TYPE_INVALID');
      expect(() =>
        validateRestoreValue('branches', { is_active: v as unknown as number }, col('BOOLEAN', false)),
      ).not.toThrow();
    }
  });

  it('regresión: INTEGER sigue aceptando enteros seguros y rechazando strings', () => {
    const intCol: Readonly<Record<string, RestoreColumn>> = {
      total_amount_cents: { type: 'INTEGER', notNull: true },
    };
    expect(() =>
      validateRestoreValue('sales', { total_amount_cents: 1180 }, intCol),
    ).not.toThrow();
    expect(() =>
      validateRestoreValue('sales', { total_amount_cents: '1180' as unknown as number }, intCol),
    ).toThrow('BACKUP_TYPE_INVALID');
  });
});

// RED/GREEN (S48 DR): la cadena de auditoría se valida como conjunto desde el
// génesis. Eventos casi simultáneos ordenan distinto por (created_at,id) y el
// verificador ingenuo de orden secuencial tumbaba simulacros DR legítimos
// (caso real: BACKUP_AUDIT_CHAIN_INVALID en staging con eslabones íntegros).
describe('verifyRestoreAuditChain: orden-independiente', () => {
  const H = (n: number): string => `${'a'.repeat(62)}${String(n).padStart(2, '0')}`;
  const genesis: RestoreAuditRow = { id: 'a', prevHash: null, rowHash: H(1) };
  const second: RestoreAuditRow = { id: 'b', prevHash: H(1), rowHash: H(2) };
  const third: RestoreAuditRow = { id: 'c', prevHash: H(2), rowHash: H(3) };
  const fourth: RestoreAuditRow = { id: 'd', prevHash: H(3), rowHash: H(4) };

  const rows =
    (...list: readonly RestoreAuditRow[]) =>
    async function* (): AsyncIterable<RestoreAuditRow> {
      for (const r of list) yield r;
    };

  it('cadena íntegra desordenada → válida (el orden de filas no importa)', async () => {
    await expect(verifyRestoreAuditChain(rows(third, genesis, fourth, second)())).resolves.toEqual({
      forks: 0,
    });
  });

  it('fork legítimo de escritores concurrentes → válido y contado', async () => {
    const branchB: RestoreAuditRow = { id: 'b2', prevHash: H(1), rowHash: H(9) };
    const result = await verifyRestoreAuditChain(rows(genesis, second, branchB)());
    expect(result).toEqual({ forks: 1 });
  });

  it('eslabón roto → BACKUP_AUDIT_CHAIN_INVALID', async () => {
    const broken: RestoreAuditRow = { ...second, prevHash: 'b'.repeat(64) };
    await expect(verifyRestoreAuditChain(rows(genesis, broken, third, fourth)())).rejects.toThrow(
      'BACKUP_AUDIT_CHAIN_INVALID',
    );
  });

  it('huérfano desconectado del génesis → sigue siendo inválido (fail-closed)', async () => {
    const orphan: RestoreAuditRow = { id: 'e', prevHash: '9'.repeat(64), rowHash: H(5) };
    await expect(
      verifyRestoreAuditChain(rows(genesis, second, third, fourth, orphan)()),
    ).rejects.toThrow('BACKUP_AUDIT_CHAIN_INVALID');
  });

  it('doble génesis → inválida', async () => {
    await expect(
      verifyRestoreAuditChain(rows(genesis, { ...second, prevHash: null })()),
    ).rejects.toThrow('BACKUP_AUDIT_CHAIN_INVALID');
  });

  it('row_hash con formato no-hex → inválida', async () => {
    await expect(
      verifyRestoreAuditChain(rows({ id: 'x', prevHash: null, rowHash: 'no-hex' })()),
    ).rejects.toThrow('BACKUP_AUDIT_CHAIN_INVALID');
  });
});
