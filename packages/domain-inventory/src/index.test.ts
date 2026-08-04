import { describe, expect, it } from 'vitest';
import { firstExpiringAtUtc, sumQty, type StockBatch } from './index.js';

const batches: readonly StockBatch[] = [
  { batchId: 'b1', productId: 'p1', qty: 10, expiresAtUtc: '2027-01-15' },
  { batchId: 'b2', productId: 'p1', qty: 5, expiresAtUtc: '2026-12-01' },
];

describe('sumQty', () => {
  it('suma el stock de todos los lotes', () => {
    expect(sumQty(batches)).toBe(15);
  });

  it('devuelve 0 sin lotes', () => {
    expect(sumQty([])).toBe(0);
  });
});

describe('firstExpiringAtUtc', () => {
  it('devuelve el lote que vence primero (FEFO)', () => {
    expect(
      firstExpiringAtUtc([
        ...batches,
        { batchId: 'b3', productId: 'p1', qty: 1, expiresAtUtc: '2027-06-01' },
      ]),
    ).toBe('2026-12-01');
  });

  it('devuelve null sin lotes', () => {
    expect(firstExpiringAtUtc([])).toBeNull();
  });
});
