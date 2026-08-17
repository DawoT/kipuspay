import { describe, expect, it } from 'vitest';
import { cashierFacingMessage, chargeButtonLabel, scaleStateLabel } from './cashier-copy';

describe('scaleStateLabel', () => {
  it('traduce estados de balanza a español de negocio', () => {
    expect(scaleStateLabel('CONNECTING')).toBe('Conectando');
    expect(scaleStateLabel('STABLE')).toBe('Lista');
    expect(scaleStateLabel('MANUAL_REQUIRED')).toBe('Peso manual');
    expect(scaleStateLabel('DISCONNECTED')).toBe('Desconectada');
  });
});

describe('cashierFacingMessage', () => {
  it('no expone códigos SERIAL_ al cajero', () => {
    expect(cashierFacingMessage('SERIAL_LEASED_BY_OTHER_TERMINAL Libera la serie')).toMatch(
      /otro terminal/i,
    );
    expect(cashierFacingMessage('SERIAL_NOT_FOUND')).not.toMatch(/SERIAL_/);
  });

  it('deja pasar mensajes humanos', () => {
    expect(cashierFacingMessage('Serie ABC agregada como una unidad.')).toBe(
      'Serie ABC agregada como una unidad.',
    );
  });
});

describe('chargeButtonLabel', () => {
  it('usa sentence case, no MAYÚSCULAS', () => {
    expect(chargeButtonLabel('12.50')).toBe('Cobrar (S/ 12.50)');
    expect(chargeButtonLabel('12.50')).not.toMatch(/^COBRAR/);
  });
});
