/* eslint-disable no-secrets/no-secrets -- public feature key is the contract under test */
import { describe, expect, it, vi } from 'vitest';

describe('inventory.scale public capability contract', () => {
  it('exports PUBLIC_FEATURE_INVENTORY_SCALE as default-off', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_SCALE', '');
    const mod = (await import('./features.js')) as Record<string, unknown>;
    const flag = mod.isInventoryScaleEnabled;
    expect(flag).toBeTypeOf('function');
    expect((flag as () => boolean)()).toBe(false);
  });
});
