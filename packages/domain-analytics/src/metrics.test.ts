import { describe, expect, it } from 'vitest';
import { computeMapePercent, holdoutSplit } from './metrics.js';

describe('holdoutSplit', () => {
  it('splits by ratio', () => {
    const { train, test } = holdoutSplit([1, 2, 3, 4, 5], 0.8);
    expect(train).toHaveLength(4);
    expect(test).toHaveLength(1);
  });

  it('keeps a trailing test slice with a high ratio', () => {
    const { train, test } = holdoutSplit([1, 2, 3], 0.99);
    expect(train).toHaveLength(2);
    expect(test).toHaveLength(1);
  });

  it('keeps at least one training point', () => {
    const { train } = holdoutSplit([1, 2, 3], 0.01);
    expect(train.length).toBeGreaterThan(0);
  });

  it('returns everything as train when split equals length', () => {
    const { train, test } = holdoutSplit([1], 0.8);
    expect(train).toEqual([1]);
    expect(test).toEqual([]);
  });

  it('rejects out-of-range ratios', () => {
    expect(() => holdoutSplit([1, 2], 0)).toThrow(RangeError);
    expect(() => holdoutSplit([1, 2], 1)).toThrow(RangeError);
  });
});

describe('computeMapePercent', () => {
  it('computes MAPE percentage', () => {
    // |(100-110)/100| = 0.10, |(200-180)/200| = 0.10 → 10%
    expect(computeMapePercent([100, 200], [110, 180])).toBeCloseTo(10, 5);
  });

  it('ignores zero actuals', () => {
    expect(computeMapePercent([0, 100], [999, 110])).toBeCloseTo(10, 5);
  });

  it('returns null when all actuals are zero or empty', () => {
    expect(computeMapePercent([0, 0], [1, 2])).toBeNull();
    expect(computeMapePercent([], [])).toBeNull();
  });

  it('returns null when predicted is missing', () => {
    expect(computeMapePercent([100], [])).toBeNull();
  });

  it('handles non-finite actuals', () => {
    expect(computeMapePercent([Number.NaN, 100], [1, 110])).toBeCloseTo(10, 5);
  });
});
