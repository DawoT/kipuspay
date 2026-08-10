import { describe, expect, it } from 'vitest';
import { detectBreakage } from './breakage.js';

describe('detectBreakage', () => {
  it('reports OK when stock covers lead time plus safety', () => {
    const r = detectBreakage({
      predictedDailyQty: 10,
      stockAvailable: 100,
      leadTimeDays: 3,
      safetyStockDays: 2,
    });
    expect(r.status).toBe('OK');
    expect(r.daysCovered).toBe(10);
    expect(r.suggestedReorderQty).toBe(0);
    expect(r.targetDays).toBe(5);
  });

  it('suggests reorder when coverage is below target', () => {
    const r = detectBreakage({
      predictedDailyQty: 10,
      stockAvailable: 20,
      leadTimeDays: 3,
      safetyStockDays: 2,
    });
    expect(r.status).toBe('REORDER_SUGGESTED');
    // needed = 5*10 = 50; suggested = ceil(50-20) = 30
    expect(r.suggestedReorderQty).toBe(30);
  });

  it('reports STOCKOUT_RISK when no stock', () => {
    const r = detectBreakage({
      predictedDailyQty: 10,
      stockAvailable: 0,
      leadTimeDays: 3,
      safetyStockDays: 2,
    });
    expect(r.status).toBe('STOCKOUT_RISK');
    expect(r.suggestedReorderQty).toBe(0);
  });

  it('returns OK without suggestion when predicted demand is zero', () => {
    const r = detectBreakage({
      predictedDailyQty: 0,
      stockAvailable: 5,
      leadTimeDays: 3,
      safetyStockDays: 2,
    });
    expect(r.status).toBe('OK');
    expect(r.suggestedReorderQty).toBe(0);
    expect(r.daysCovered).toBe(Number.POSITIVE_INFINITY);
  });

  it('handles negative stock and negative demand gracefully', () => {
    const neg = detectBreakage({
      predictedDailyQty: 5,
      stockAvailable: -3,
      leadTimeDays: 1,
      safetyStockDays: 0,
    });
    expect(neg.status).toBe('STOCKOUT_RISK');
    expect(neg.daysCovered).toBeGreaterThanOrEqual(0);

    const negDemand = detectBreakage({
      predictedDailyQty: -4,
      stockAvailable: 9,
      leadTimeDays: 1,
      safetyStockDays: 0,
    });
    expect(negDemand.status).toBe('OK');
  });

  it('no safety stock uses only lead time as target', () => {
    const r = detectBreakage({
      predictedDailyQty: 10,
      stockAvailable: 10,
      leadTimeDays: 2,
      safetyStockDays: 0,
    });
    expect(r.targetDays).toBe(2);
    // daysCovered = 1 < 2 → reorder, needed = 20, suggested = 10
    expect(r.status).toBe('REORDER_SUGGESTED');
    expect(r.suggestedReorderQty).toBe(10);
  });
});
