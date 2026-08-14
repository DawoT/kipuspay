import { expect, test, type Page } from '@playwright/test';

/**
 * S7 (Sprint 7) — claim del onboarding: el notice solo aplica sin sesión.
 * Un token ya consumido (reload con URL vieja) NO es un error si el login
 * del claim anterior sigue activo.
 */

async function mockClaim(page: Page, status: number) {
  await page.route('**/api/onboarding/claim', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body:
        status === 200
          ? JSON.stringify({
              token: 'jwt-claim',
              expiresAt: '2026-08-14T23:00:00.000Z',
              user: { userId: 'owner-e2e', role: 'owner', branchId: 'branch-e2e' },
              cashRegisterSessionId: 'session-e2e',
            })
          : JSON.stringify({ error: 'Token ya usado', code: 'TOKEN_USED' }),
    }),
  );
}

async function mockSession(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
      }),
    }),
  );
}

test('token ya consumido con login activo → sin notice (S7)', async ({ page }) => {
  await mockClaim(page, 403);
  await mockSession(page);
  await page.addInitScript(() => {
    localStorage.setItem('kipuspay_token', 'jwt-existing');
    localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    localStorage.setItem(
      'kipuspay_user',
      JSON.stringify({ userId: 'owner-e2e', role: 'owner', branchId: 'branch-e2e' }),
    );
  });
  await page.goto('/?onboarding_token=used-once');
  await expect(page.getByTestId('onboarding-notice')).toHaveCount(0);
});

test('token inválido sin login → notice con instrucción (regresión)', async ({ page }) => {
  await mockClaim(page, 403);
  await mockSession(page);
  await page.addInitScript(() => {
    localStorage.removeItem('kipuspay_token');
  });
  await page.goto('/?onboarding_token=expired');
  await expect(page.getByTestId('onboarding-notice')).toContainText(
    'Usa "Ingresar" con tu badge y PIN',
  );
});
