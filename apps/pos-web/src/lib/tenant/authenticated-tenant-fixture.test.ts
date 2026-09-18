import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { installAuthenticatedTenant } from '../../../tests/e2e/fixtures/authenticated-tenant';

describe('authenticated tenant E2E fixture', () => {
  it('rejects capability identifiers the Worker cannot issue', async () => {
    await expect(
      installAuthenticatedTenant({} as Page, {
        tenantId: 'tenant-invalid-capability',
        capabilities: ['fiscal.circuit_breaker'],
      }),
    ).rejects.toThrow(/capability.*no canónica.*fiscal\.circuit_breaker/i);
  });

  it('persists the onboarding cash session in the shared authenticated setup', async () => {
    const local = new Map<string, string>();
    const session = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      setItem: (key: string, value: string) => local.set(key, value),
    });
    vi.stubGlobal('sessionStorage', {
      setItem: (key: string, value: string) => session.set(key, value),
    });
    const page = {
      addInitScript: async (callback: (arg: unknown) => void, arg: unknown) => callback(arg),
      route: async () => undefined,
    } as unknown as Page;

    try {
      await installAuthenticatedTenant(page, {
        tenantId: 'tenant-restaurant',
        capabilities: ['orders.kds'],
        onboardingClaim: { branchId: 'branch-restaurant', sessionId: 'cash-session-1' },
      } as Parameters<typeof installAuthenticatedTenant>[1]);
      expect(local.get('kipuspay.onboarding.claim')).toBe(
        JSON.stringify({
          branchId: 'branch-restaurant',
          sessionId: 'cash-session-1',
          tenantId: 'tenant-restaurant',
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
