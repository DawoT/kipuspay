import { describe, expect, it, vi } from 'vitest';

describe('features soft-launch', () => {
  it('default off', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_FEATURE_MARKETING_SITE', '');
    const mod = await import('./features.js');
    expect(mod.isMarketingSiteEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('on con 1', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_FEATURE_MARKETING_SITE', '1');
    const mod = await import('./features.js');
    expect(mod.isMarketingSiteEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
