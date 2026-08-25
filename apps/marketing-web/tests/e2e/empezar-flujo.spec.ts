import { expect, test } from '@playwright/test';

// docs/ops/legal_and_sales_guide.md Parte I §2.4/§3.3 y audit B1-B3: el
// onboarding de 4 pasos crea la cuenta real (credenciales EMP-/PIN visibles
// una sola vez), sin jerga fiscal ("No usamos la palabra contingencia") y
// redirige al POS con el token single-use.

test('empezar: 4 pasos → credenciales → redirect con token al POS', async ({ page }) => {
  await page.route('**/v1/onboarding/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId: 't-e2e',
        ownerBadge: 'EMP-12345',
        ownerPin: '4321',
        onboardingToken: 'jwt-onboarding-e2e',
      }),
    }),
  );
  await page.goto('/empezar');
  await expect(page.getByTestId('onboarding-page')).toBeVisible();
  await expect(page.getByText('Tu primera venta en menos de 5 minutos.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Nombre comercial' }).fill('Bodega E2E');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Retail y minimarkets' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Solo control interno Nota de' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByText('Primera venta guiada')).toBeVisible();
  await expect(page.getByText(/control interno/)).toBeVisible();

  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByTestId('onboarding-credentials')).toBeVisible();
  await expect(page.getByTestId('onboarding-credentials')).toContainText(/EMP-12345/);
  await expect(page.getByTestId('onboarding-credentials')).toContainText(/4321/);

  const outgoing: string[] = [];
  await page.route('https://app.kipuspay.com/**', (route) => {
    outgoing.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>ok</title>',
    });
  });
  await page.getByTestId('onboarding-go-pos').click();
  await expect.poll(() => outgoing.length).toBeGreaterThan(0);
  const target = outgoing[0] ?? '';
  expect(target).toMatch(/onboarding=1&tenant=t-e2e&onboarding_token=/);
  expect(target).toMatch(/mode=INTERNAL_CONTROL&vertical=retail/);
});
