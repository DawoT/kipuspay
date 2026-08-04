import { describe, expect, it, vi } from 'vitest';

describe('features flags default off', () => {
  it('checkout/print/vitrina off sin env', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_FEATURE_POS_CHECKOUT', '');
    vi.stubEnv('PUBLIC_FEATURE_PRINT_TEMPLATES', '');
    vi.stubEnv('PUBLIC_FEATURE_VITRINA', '');
    const mod = await import('./features.js');
    expect(mod.isPosCheckoutEnabled()).toBe(false);
    expect(mod.isPrintTemplatesEnabled()).toBe(false);
    expect(mod.isVitrinaEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
