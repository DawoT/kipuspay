import { describe, expect, it } from 'vitest';

describe('inventory.scale backend capability contract', () => {
  it('exports FEATURE_INVENTORY_SCALE as default-off', async () => {
    const mod = (await import('./features.js')) as Record<string, unknown>;
    const flag = mod.isInventoryScaleEnabled;
    expect(flag).toBeTypeOf('function');
    expect((flag as (env: unknown) => boolean)(undefined)).toBe(false);
  });
});
