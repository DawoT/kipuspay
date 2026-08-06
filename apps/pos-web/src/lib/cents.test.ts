import { describe, expect, it } from 'vitest';
import { formatCents } from './cents.js';

describe('formatCents', () => {
  it('formatea centavos con dos dígitos', () => {
    expect(formatCents(11600)).toBe('116.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-50)).toBe('-0.50');
    expect(formatCents(-150)).toBe('-1.50');
  });
});
