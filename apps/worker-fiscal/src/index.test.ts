import { describe, expect, it } from 'vitest';
import { cdrVerdict } from './index.js';

describe('cdrVerdict', () => {
  it('aceptada solo con CDR válido', () => {
    expect(cdrVerdict({ cdrCode: '0', cdrDescription: 'ok', accepted: true })).toBe('aceptada');
    expect(cdrVerdict({ cdrCode: '2335', cdrDescription: 'no', accepted: false })).toBe(
      'rechazada',
    );
  });
});
