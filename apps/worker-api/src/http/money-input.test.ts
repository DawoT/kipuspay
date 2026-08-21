import { describe, expect, it } from 'vitest';
import {
  isFiniteNumber,
  isMoneyInteger,
  parseFiniteNumber,
  parseMoneyInteger,
  parseMoneyToCents,
} from './money-input.js';

describe('money-input (CAL-01)', () => {
  it('rechaza coerción silenciosa: Number(true)=1, Number([])=0', () => {
    expect(isMoneyInteger(true)).toBe(false);
    expect(isMoneyInteger([])).toBe(false);
    expect(isMoneyInteger('100')).toBe(false);
    expect(isMoneyInteger(1.5)).toBe(false);
    expect(isMoneyInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('acepta enteros seguros y rechaza no finitos', () => {
    expect(isMoneyInteger(0)).toBe(true);
    expect(isMoneyInteger(12345)).toBe(true);
    expect(isMoneyInteger(Number.NaN)).toBe(false);
    expect(isMoneyInteger(Infinity)).toBe(false);
    expect(isFiniteNumber(3.25)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
  });

  it('parsea a null lo inválido y preserva lo válido', () => {
    expect(parseMoneyInteger(500)).toBe(500);
    expect(parseMoneyInteger('500')).toBeNull();
    expect(parseMoneyInteger(true)).toBeNull();
    expect(parseFiniteNumber(2.5)).toBe(2.5);
    expect(parseFiniteNumber('2.5')).toBeNull();
  });
});

describe('parseMoneyToCents (US-01: string decimal → cents sin float)', () => {
  it('convierte strings decimales a cents enteros por aritmética de dígitos', () => {
    expect(parseMoneyToCents('10.50')).toBe(1050);
    expect(parseMoneyToCents('10.5')).toBe(1050);
    expect(parseMoneyToCents('10')).toBe(1000);
    expect(parseMoneyToCents('0.01')).toBe(1);
    expect(parseMoneyToCents('0')).toBe(0);
    expect(parseMoneyToCents(' 12.34 ')).toBe(1234);
  });

  it('preserva enteros seguros (ya en cents) y rechaza coerciones', () => {
    expect(parseMoneyToCents(1000)).toBe(1000);
    expect(parseMoneyToCents(0)).toBe(0);
    expect(parseMoneyToCents(true)).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents(undefined)).toBeNull();
    expect(parseMoneyToCents([])).toBeNull();
  });

  it('rechaza strings inválidas (más de 2 decimales, separadores, sintaxis)', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('10,50')).toBeNull();
    expect(parseMoneyToCents('.5')).toBeNull();
    expect(parseMoneyToCents('10.')).toBeNull();
    expect(parseMoneyToCents('10.555')).toBeNull();
    expect(parseMoneyToCents('1e3')).toBeNull();
    expect(parseMoneyToCents('Infinity')).toBeNull();
  });

  it('respeta MAX_SAFE_INTEGER sin perder precisión (sin float)', () => {
    expect(parseMoneyToCents('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMoneyToCents('90071992547409.92')).toBeNull();
    expect(parseMoneyToCents('999999999999999999')).toBeNull();
  });

  it('US-01 bullet: number float con ≤2 decimales → cents enteros (19.99 → 1999)', () => {
    expect(parseMoneyToCents(19.99)).toBe(1999);
    expect(parseMoneyToCents(1.5)).toBe(150);
    expect(parseMoneyToCents(0.01)).toBe(1);
    expect(parseMoneyToCents(10.5)).toBe(1050);
    expect(parseMoneyToCents(123.45)).toBe(12345);
  });

  it('US-01 bullet: artefactos float y no finitos → null fail-closed (sin redondeo)', () => {
    // 0.1+0.2 es 0.30000000000000004 (>2 decimales): jamás se redondea a 30.
    expect(parseMoneyToCents(0.1 + 0.2)).toBeNull();
    expect(parseMoneyToCents(1.005)).toBeNull();
    expect(parseMoneyToCents(1e21)).toBeNull();
    expect(parseMoneyToCents(Number.NaN)).toBeNull();
    expect(parseMoneyToCents(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('US-10/AC1: strings negativos → cents (-19.99 → -1999, -5 → -500)', () => {
    expect(parseMoneyToCents('-19.99')).toBe(-1999);
    expect(parseMoneyToCents('-5')).toBe(-500);
    expect(parseMoneyToCents('-10.50')).toBe(-1050);
    expect(parseMoneyToCents('-10.5')).toBe(-1050);
    expect(parseMoneyToCents('-0.5')).toBe(-50);
    expect(parseMoneyToCents('-0.01')).toBe(-1);
    expect(parseMoneyToCents(' -19.99 ')).toBe(-1999);
    expect(parseMoneyToCents('-90071992547409.91')).toBe(-Number.MAX_SAFE_INTEGER);
    expect(parseMoneyToCents('-90071992547409.92')).toBeNull();
  });

  it('US-10/AC1: cero negativo y signos inválidos → null fail-closed', () => {
    expect(parseMoneyToCents('-0')).toBeNull();
    expect(parseMoneyToCents('-0.00')).toBeNull();
    expect(parseMoneyToCents('-0.0')).toBeNull();
    expect(parseMoneyToCents('+5')).toBeNull();
    expect(parseMoneyToCents('+-5')).toBeNull();
    expect(parseMoneyToCents('--5')).toBeNull();
    expect(parseMoneyToCents('- 5')).toBeNull();
    expect(parseMoneyToCents('-')).toBeNull();
  });

  it('US-10/AC1: espejo por la vía number (mismo contrato según decimales)', () => {
    expect(parseMoneyToCents(-19.99)).toBe(-1999);
    expect(parseMoneyToCents(-5.5)).toBe(-550);
    expect(parseMoneyToCents(-0.5)).toBe(-50);
  });

  it('US-01 adversarial: agota la lista del acceptance via parser', () => {
    // '1e2' y '0x10' son syntaxes numéricas que Number() aceptaría (100, 16)
    // pero el parser de dígitos debe rechazar (no son decimales).
    expect(parseMoneyToCents('1e2')).toBeNull();
    expect(parseMoneyToCents('0x10')).toBeNull();
    // Dígitos full-width unicode '１００': visualmente 100, no son ASCII.
    expect(parseMoneyToCents('１００')).toBeNull();
    // No líquido: objetos, NaN e Infinity jamás se convierten a cents.
    expect(parseMoneyToCents({})).toBeNull();
    expect(parseMoneyToCents(Number.NaN)).toBeNull();
    expect(parseMoneyToCents(Number.POSITIVE_INFINITY)).toBeNull();
    // Fuera de rango seguro: MAX_SAFE_INTEGER+1 vía el parser (number path).
    expect(parseMoneyToCents(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });
});
