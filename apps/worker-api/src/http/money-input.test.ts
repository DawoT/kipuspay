import { describe, expect, it } from 'vitest';
import {
  isFiniteNumber,
  isMoneyInteger,
  parseFiniteNumber,
  parseMoneyInteger,
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
