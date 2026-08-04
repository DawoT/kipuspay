import { describe, expect, it } from 'vitest';
import { netBalanceCents, toExcelAmountCents } from './index.js';

describe('netBalanceCents', () => {
  it('suma movimientos contables', () => {
    expect(
      netBalanceCents([
        { glAccount: '1212', amountCents: 10000 },
        { glAccount: '4011', amountCents: -1530 },
      ]),
    ).toBe(8470);
  });
});

describe('toExcelAmountCents', () => {
  it('convierte centavos a soles', () => {
    expect(toExcelAmountCents(8470)).toBe(84.7);
  });
});
