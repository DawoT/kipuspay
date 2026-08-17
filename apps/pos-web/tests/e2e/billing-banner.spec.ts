import { expect, test, type Page } from '@playwright/test';
import { mockOnboardingClaim } from './fixtures/onboarding-claim';

/** S9-A2 — anti-apagado: banner ámbar de pago informa pero la caja sigue. */
async function mockSessionWithBilling(page: Page, billing: Record<string, unknown>) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
        billing,
      }),
    }),
  );
}

test('past_due en gracia → banner visible y la caja sigue operando', async ({ page }) => {
  await mockSessionWithBilling(page, {
    subscriptionStatus: 'past_due',
    trialEndsAt: null,
    pastGracePeriod: false,
  });
  await mockOnboardingClaim(page);
  await page.goto('/?onboarding_token=e2e-claim-token&tenant=t-e2e');
  await expect(page.getByTestId('billing-banner')).toContainText(
    'Actualiza tu método de pago en los próximos 3 días',
  );
  await expect(page.getByTestId('billing-banner')).toContainText('La caja sigue operando');
});

test('suscripción activa → sin banner', async ({ page }) => {
  await mockSessionWithBilling(page, {
    subscriptionStatus: 'active',
    trialEndsAt: null,
    pastGracePeriod: false,
  });
  await mockOnboardingClaim(page);
  await page.goto('/?onboarding_token=e2e-claim-token&tenant=t-e2e');
  await expect(page.getByTestId('billing-banner')).toHaveCount(0);
});
