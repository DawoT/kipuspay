import { describe, expect, it } from 'vitest';
import { countErrors, validateImportRow } from './index.js';

describe('validateImportRow', () => {
  it('acepta filas con sku', () => {
    expect(validateImportRow({ sku: 'A-1' })).toEqual({ ok: true, row: { sku: 'A-1' } });
  });

  it('rechaza filas sin sku', () => {
    expect(validateImportRow({}).ok).toBe(false);
  });
});

describe('countErrors', () => {
  it('cuenta las filas inválidas', () => {
    expect(countErrors([{ sku: 'A' }, {}, { sku: 'B' }])).toBe(1);
  });
});
