import { describe, expect, it } from 'vitest';
import {
  assertPerceptionCategory,
  assertRetentionCategory,
  computeDetractionCents,
  computePerceptionCents,
  computeRetentionCents,
  DETRACTION_RATES,
  PERCEPTION_RATES,
  RETENTION_RATES,
} from './withholdings.js';

describe('withholdings (P1c, ADR-FISCAL-005)', () => {
  it('percepción: 2% mercancías, 0.5% resto, redondeo en cents', () => {
    expect(PERCEPTION_RATES).toEqual({ goods: 200, other: 50 });
    expect(computePerceptionCents(10_000, 'goods')).toBe(200);
    expect(computePerceptionCents(10_000, 'other')).toBe(50);
    // redondeo: 10001 * 0.02 = 200.02 -> 200
    expect(computePerceptionCents(10_001, 'goods')).toBe(200);
    // 3333 * 0.02 = 66.66 -> 67
    expect(computePerceptionCents(3_333, 'goods')).toBe(67);
  });

  it('retención: 3% bienes, 6% servicios, 12% comisiones', () => {
    expect(RETENTION_RATES).toEqual({ goods: 300, services: 600, commissions: 1200 });
    expect(computeRetentionCents(10_000, 'goods')).toBe(300);
    expect(computeRetentionCents(10_000, 'services')).toBe(600);
    expect(computeRetentionCents(10_000, 'commissions')).toBe(1200);
  });

  it('detracción: 4% transporte/bienes, 12% servicios (anexo 2)', () => {
    expect(DETRACTION_RATES).toEqual({ transport: 400, goods: 400, service: 1200 });
    expect(computeDetractionCents(25_000, 'goods')).toBe(1000);
    expect(computeDetractionCents(25_000, 'service')).toBe(3000);
  });

  it('rechaza bases no enteras, no positivas o tasas inválidas', () => {
    expect(() => computePerceptionCents(0, 'goods')).toThrow('INVALID_BASE_AMOUNT');
    expect(() => computePerceptionCents(10.5, 'goods')).toThrow('INVALID_BASE_AMOUNT');
    expect(() => computePerceptionCents(100, 'nope' as never)).toThrow('INVALID_RATE');
  });

  it('categorías cerradas por catálogo', () => {
    expect(() => assertPerceptionCategory('services')).toThrow('INVALID_PERCEPTION_CATEGORY');
    expect(assertPerceptionCategory('goods')).toBe('goods');
    expect(() => assertRetentionCategory('goods2')).toThrow('INVALID_RETENTION_CATEGORY');
    expect(assertRetentionCategory('commissions')).toBe('commissions');
  });

  it('montos percibidos < base (la percepción nunca supera la base)', () => {
    expect(computePerceptionCents(100, 'goods')).toBeLessThan(100);
    expect(computeRetentionCents(100, 'commissions')).toBeLessThan(100);
  });
});
