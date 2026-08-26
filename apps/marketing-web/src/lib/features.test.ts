import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

async function loadFeatures() {
  vi.resetModules();
  return import('./features.js');
}

async function withEnv(value: string | undefined, run: () => Promise<boolean>) {
  const prev = process.env.PUBLIC_FEATURE_MARKETING_SITE;
  if (value === undefined) delete process.env.PUBLIC_FEATURE_MARKETING_SITE;
  else process.env.PUBLIC_FEATURE_MARKETING_SITE = value;
  try {
    return await run();
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_FEATURE_MARKETING_SITE;
    else process.env.PUBLIC_FEATURE_MARKETING_SITE = prev;
  }
}

describe('features soft-launch', () => {
  it('default off', async () => {
    const on = await withEnv('', async () => (await loadFeatures()).isMarketingSiteEnabled());
    expect(on).toBe(false);
  });

  it('off con 0', async () => {
    const on = await withEnv('0', async () => (await loadFeatures()).isMarketingSiteEnabled());
    expect(on).toBe(false);
  });

  it('on con 1', async () => {
    const on = await withEnv('1', async () => (await loadFeatures()).isMarketingSiteEnabled());
    expect(on).toBe(true);
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
    expect(wrangler).toContain('kipuspay-pos-web-staging.pages.dev');
  });
});
