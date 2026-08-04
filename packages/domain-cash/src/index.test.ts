import { describe, expect, it } from 'vitest';
import { diffCents, drawIsBalanced, type DrawerSnapshot } from './index.js';

const base: DrawerSnapshot = {
  sessionId: 's1',
  state: 'open',
  openingCents: 1000,
  expectedCents: 5000,
  countedCents: 5200,
};

describe('diffCents', () => {
  it('devuelve la diferencia contado - esperado', () => {
    expect(diffCents(base)).toBe(200);
  });

  it('devuelve null cuando aún no hay conteo', () => {
    expect(diffCents({ ...base, countedCents: null })).toBeNull();
  });
});

describe('drawIsBalanced', () => {
  it('verdadero solo con diferencia exacta cero', () => {
    expect(drawIsBalanced({ ...base, countedCents: 5000 })).toBe(true);
    expect(drawIsBalanced(base)).toBe(false);
    expect(drawIsBalanced({ ...base, countedCents: null })).toBe(false);
  });
});
