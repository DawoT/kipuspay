import { describe, expect, it } from 'vitest';
import {
  applyIgvCents,
  buildSaleTotals,
  computeSubtotalCents,
  IGV_RATE_PER_MILLE,
} from './index.js';

describe('computeSubtotalCents', () => {
  it('suma precio por cantidad en centavos sin redondeo', () => {
    const lines = [
      { productId: 'a', priceCents: 1500, qty: 2 },
      { productId: 'b', priceCents: 99, qty: 3 },
    ];
    expect(computeSubtotalCents(lines)).toBe(3000 + 297);
  });

  it('devuelve 0 con la cesta vacía', () => {
    expect(computeSubtotalCents([])).toBe(0);
  });
});

describe('applyIgvCents', () => {
  it('calcula el IGV con redondeo de banquero', () => {
    expect(applyIgvCents(1000, 180)).toBe(180);
    expect(applyIgvCents(1, 180)).toBe(0);
    expect(applyIgvCents(6, 180)).toBe(1);
  });
});

describe('buildSaleTotals', () => {
  it('arma los totales con IGV incluido', () => {
    const totals = buildSaleTotals([{ productId: 'a', priceCents: 5000, qty: 2 }]);
    expect(totals.subtotalCents).toBe(10000);
    expect(totals.igvCents).toBe(1800);
    expect(totals.totalCents).toBe(11800);
  });

  it('suma el IGV por línea en vez de aplicar la tasa al agregado (M1)', () => {
    const perLine = buildSaleTotals([
      { productId: 'a', priceCents: 6, qty: 1 },
      { productId: 'b', priceCents: 6, qty: 1 },
    ]);
    expect(perLine.subtotalCents).toBe(12);
    expect(perLine.igvCents).toBe(2);
    const aggregated = applyIgvCents(12, IGV_RATE_PER_MILLE);
    expect(aggregated).toBe(2);
    expect(perLine.igvCents).toBe(aggregated);
  });
});
