import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('dev harness guard (S5)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sin PUBLIC_ENABLE_DEV_HARNESS → error 404 (nunca en prod)', async () => {
    vi.stubEnv('PUBLIC_ENABLE_DEV_HARNESS', undefined);
    const { load } = await import('./+page.js');
    let thrown: unknown = null;
    try {
      load();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ status: 404 });
  });

  it('con PUBLIC_ENABLE_DEV_HARNESS=1 → load OK', async () => {
    vi.stubEnv('PUBLIC_ENABLE_DEV_HARNESS', '1');
    const { load } = await import('./+page.js');
    expect(load()).toEqual({});
  });
});
