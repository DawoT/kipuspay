import { expect, test } from '@playwright/test';

// Plan H1: embudo marketing→POS con gancho autotest=boleta.
// Marketing solo propaga la señal; el POS la consume gated (DEV/PUBLIC_E2E_AUTOTEST).
// Este E2E cubre funnel completo marketing → POS → CDR sin duplicar lógica fiscal.
// Con PUBLIC_FEATURE_MARKETING_SITE=1 y PUBLIC_E2E_AUTOTEST=1 el CTA home y el
// redirect de /empezar deben preservar ?autotest=boleta (RC H1: boleta 03 S/0.01
// a DNI 10715001701 + ND 08).

test('home CTA propaga ?autotest=boleta a /empezar', async ({ page }) => {
  await page.goto('/?autotest=boleta');
  await expect(page.getByTestId('home-hero')).toBeVisible();
  const heroCta = page.locator('.hero-actions a.btn').first();
  await expect(heroCta).toHaveAttribute('href', '/empezar?autotest=boleta');
  const stickyCta = page.locator('a.btn-sticky');
  await expect(stickyCta).toHaveAttribute('href', '/empezar?autotest=boleta');
  const finalCta = page.locator('#final-cta a.btn').first();
  await expect(finalCta).toHaveAttribute('href', '/empezar?autotest=boleta');
});

test('home sin autotest mantiene href /empezar', async ({ page }) => {
  await page.goto('/');
  const heroCta = page.locator('.hero-actions a.btn').first();
  await expect(heroCta).toHaveAttribute('href', '/empezar');
});

test('empezar → POS propaga &autotest=boleta al redirect', async ({ page }) => {
  await page.route('**/v1/onboarding/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId: 't-e2e-boleta',
        ownerBadge: 'EMP-E2E-001',
        ownerPin: '1234',
        onboardingToken: 'tok-e2e',
      }),
    }),
  );
  await page.goto('/empezar?autotest=boleta');
  await page.getByTestId('trade-name-input').fill('Tienda E2E');
  await page.getByTestId('ruc-input').fill('20612913251');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page
    .getByRole('button', { name: /Restaurantes|Retail/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page
    .getByRole('button', { name: /Solo control interno|Estoy activando/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await page.getByTestId('onboarding-go-pos').click();
  await page.waitForURL(/autotest=boleta/);
  expect(page.url()).toContain('autotest=boleta');
});
