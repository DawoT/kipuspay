import { describe, expect, it } from 'vitest';
import { formatMoney, parseSolesToCents } from './money';

describe('parseSolesToCents', () => {
  it('interpreta enteros como centavos (contrato POS)', () => {
    expect(parseSolesToCents('1500')).toBe(1500);
    expect(parseSolesToCents('0')).toBe(0);
  });

  it('interpreta soles con punto decimal', () => {
    expect(parseSolesToCents('15.50')).toBe(1550);
    expect(parseSolesToCents('0.50')).toBe(50);
    expect(parseSolesToCents('1500.00')).toBe(150000);
  });

  it('interpreta soles con coma decimal (es-PE)', () => {
    expect(parseSolesToCents('15,50')).toBe(1550);
    expect(parseSolesToCents('0,05')).toBe(5);
  });

  it('tolera espacios y un solo decimal', () => {
    expect(parseSolesToCents(' 15.5 ')).toBe(1550);
    expect(parseSolesToCents('118 ')).toBe(118);
  });

  it('rechaza más de dos decimales', () => {
    expect(parseSolesToCents('15.505')).toBeNull();
    expect(parseSolesToCents('1.234')).toBeNull();
  });

  it('rechaza doble separador y entradas inválidas', () => {
    expect(parseSolesToCents('1.234,56')).toBeNull();
    expect(parseSolesToCents('abc')).toBeNull();
    expect(parseSolesToCents('')).toBeNull();
    expect(parseSolesToCents('   ')).toBeNull();
    expect(parseSolesToCents('-15')).toBeNull();
    expect(parseSolesToCents('12.3.4')).toBeNull();
    expect(parseSolesToCents('Infinity')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formatea soles con dos decimales y prefijo S/', () => {
    expect(formatMoney(1550)).toBe('S/ 15.50');
    expect(formatMoney(0)).toBe('S/ 0.00');
  });

  it('formatea negativos y cantidades grandes', () => {
    expect(formatMoney(-500)).toBe('S/ -5.00');
    expect(formatMoney(123456)).toBe('S/ 1234.56');
  });
});

describe('G2 auditoría — parse de soles nunca pierde precisión', () => {
  it('rechaza monto con más de 9 dígitos enteros (overflow seguro)', () => {
    expect(parseSolesToCents('9999999999.99')).toBeNull(); // 10 dígitos > 2^31-1 cents
  });

  it('parsea el máximo seguro sin error', () => {
    expect(parseSolesToCents('99999999.99')).not.toBeNull();
  });

  it('0.5 → 50 cents exactos sin float', () => {
    expect(parseSolesToCents('0.5')).toBe(50);
  });
});
