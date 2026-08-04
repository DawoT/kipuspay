import { describe, expect, it } from 'vitest';
import { cdrIsAccepted, formalizeDescriptor } from './index.js';

describe('cdrIsAccepted', () => {
  it('acepta solo CDR código 0 y flag accepted', () => {
    expect(cdrIsAccepted({ cdrCode: '0', cdrDescription: 'Aceptada', accepted: true })).toBe(true);
    expect(cdrIsAccepted({ cdrCode: '2335', cdrDescription: 'Rechazo', accepted: false })).toBe(
      false,
    );
    expect(cdrIsAccepted({ cdrCode: '0', cdrDescription: 'raro', accepted: false })).toBe(false);
  });
});

describe('formalizeDescriptor', () => {
  it('formatea serie-correlativo con relleno a 8 dígitos', () => {
    expect(formalizeDescriptor({ issuerRuc: '20123456789', series: 'F001', correlative: 42 })).toBe(
      'F001-00000042',
    );
  });
});
