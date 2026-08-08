import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');

describe('authenticated app shell source integration', () => {
  it('loads and provides the reactive authenticated session to child routes', () => {
    expect(layout).toContain('loadAuthenticatedAppShellSession');
    expect(layout).toContain('provideAdminAuthenticatedSessionState');
    expect(layout).toContain('authenticatedSession = await');
  });

  it('derives pickup and cash navigation from verified role and public capability', () => {
    expect(layout).toContain('showCustomerOrder' + 'Navigation');
    expect(layout).toContain('showCashOperating' + 'Navigation');
    expect(layout).toContain('isCustomerOrdersEnabled');
    expect(layout).not.toContain('PUBLIC_DEV_ROLE');
    expect(layout).not.toContain('Bearer demo');
  });
});
