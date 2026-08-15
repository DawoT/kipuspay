import { expect, test } from '@playwright/test';
import { mockOnboardingClaim } from './fixtures/onboarding-claim';
import { mockSellableCatalog } from './fixtures/sellable-catalog';

/**
 * F-4 (auditoría browser) — el claim del onboarding vive en memoria
 * (lastClaim). Tras un reload, la sesión de caja se pierde y onCharge
 * bloquea con "No hay una sesión de caja abierta". El claim debe persistir
 * (storage) y rehidratarse para que el cobro sobreviva a una recarga.
 */
test('F-4: el cobro sobrevive a un reload tras el claim de onboarding', async ({ page }) => {
  await mockOnboardingClaim(page);
  await mockSellableCatalog(page);
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
  await page.goto('/?onboarding_token=e2e-claim');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await page.reload();
  await page.getByTestId('add-line-p1').click();
  await page.getByTestId('charge').click();
  await expect(page.getByTestId('message')).toContainText('cobrada');
  await expect(page.getByTestId('message')).not.toContainText('No hay una sesión de caja abierta');
});