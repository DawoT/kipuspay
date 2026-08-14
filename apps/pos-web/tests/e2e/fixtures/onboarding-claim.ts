import type { Page } from '@playwright/test';

/**
 * Fixture del claim de onboarding (M6C): simula el server /api/onboarding/claim
 * y deja la sesión de caja lista para cobrar (fe de errata de walkthrough,
 * Sprint 7: el checkout requiere branch + cashRegisterSessionId reales).
 */
export async function mockOnboardingClaim(page: Page) {
  await page.route('**/api/onboarding/claim', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'jwt-claim-e2e',
        expiresAt: '2026-08-15T00:00:00.000Z',
        user: { userId: 'owner-e2e', role: 'owner', branchId: 'branch-e2e' },
        cashRegisterSessionId: 'session-e2e',
      }),
    }),
  );
}
