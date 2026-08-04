import { readFileSync } from 'node:fs';
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

  it('wiring: un solo nombre y default off en build (soft-launch real)', () => {
    const pkg = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
    const envExample = readFileSync(new URL('../../env.example', import.meta.url), 'utf8');

    expect(pkg).not.toMatch(/PUBLIC_FEATURE_MARKETING_SITE=1/);
    expect(wrangler).toContain('PUBLIC_FEATURE_MARKETING_SITE');
    expect(wrangler).not.toContain('"FEATURE_MARKETING_SITE"');
    const envLine = envExample.split('\n').find((l) => l.includes('PUBLIC_FEATURE_MARKETING_SITE'));
    expect(envLine).toBeDefined();
    expect(envLine?.trim().endsWith('0')).toBe(true);
  });
});
