import { describe, expect, it } from 'vitest';
import { formatCents, sumCents } from './money.js';

describe('dinero de marca', () => {
  it('formatea centimos enteros con dos decimales', () => {
    expect(formatCents(2395)).toBe('23.95');
    expect(formatCents(500)).toBe('5.00');
    expect(formatCents(7)).toBe('0.07');
  });

  it('mantiene el signo sin perder centimos', () => {
    expect(formatCents(-1250)).toBe('-12.50');
    expect(formatCents(-5)).toBe('-0.05');
  });

  it('suma sin coma flotante', () => {
    expect(sumCents([300, 560, 1170])).toBe(2030);
    expect(sumCents([])).toBe(0);
  });
});
