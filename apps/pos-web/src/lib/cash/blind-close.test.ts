import { describe, expect, it } from 'vitest';
import { PEN_DENOMS, sumLocalCount } from './blind-close.js';

describe('sumLocalCount', () => {
  it('suma denominaciones sin exponer expected', () => {
    expect(
      sumLocalCount([
        { denominationCents: 1000, quantity: 2 },
        { denominationCents: 100, quantity: 3 },
      ]),
    ).toBe(2300);
  });
});

describe('PEN_DENOMS', () => {
  it('incluye billetes y monedas en cents', () => {
    expect(PEN_DENOMS).toContain(20000);
    expect(PEN_DENOMS).toContain(10);
  });
});
