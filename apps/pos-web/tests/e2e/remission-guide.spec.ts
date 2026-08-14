import { expect, test } from '@playwright/test';
import { mockOnboardingClaim } from './fixtures/onboarding-claim';

test('P1b: inventario emite una GRE con serie T y muestra el resultado', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e', // S10-D7: branch real del claim
        terminal: null,
      }),
    }),
  );
  // S10-D7: la página usa el branch real del login (claim); sin claim el
  // branch queda vacío y la validación cliente rechaza la emisión.
  await mockOnboardingClaim(page);
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  let sentBody: Record<string, unknown> | null = null;
  await page.route('**/api/inventory/remission-guides', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    sentBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        remissionGuideId: 'g-1',
        series: 'T001',
        number: 8,
        transferReasonCode: '13',
        sunatStatus: 'PENDING',
      }),
    });
  });

  await page.goto('/admin/inventario?onboarding_token=e2e-claim-token&tenant=t-e2e');
  await page.getByTestId('gre-series').fill('T001');
  await page.getByTestId('gre-motive').selectOption('13');
  await page.getByTestId('gre-mode').selectOption('02');
  await page.getByTestId('gre-plate').fill('ABC-123');
  await page.getByTestId('gre-carrier-doc').selectOption('1');
  await page.getByTestId('gre-carrier-number').fill('12345678');
  await page.getByTestId('gre-carrier-name').fill('Carlos Ruiz');
  await page.getByTestId('gre-origin-address').fill('Av. Lima 100');
  await page.getByTestId('gre-dest-address').fill('Jr. Callao 200');
  await page.getByTestId('gre-submit').click();
  await expect(page.getByTestId('gre-msg')).toContainText('T001-008');
  await expect(page.getByTestId('gre-msg')).toContainText('motivo 13');
  expect(sentBody).toMatchObject({
    branchId: 'branch-e2e', // S10-D7: branch real del claim
    series: 'T001',
    transferReasonCode: '13',
    transportModeCode: '02',
    carrier: { documentType: '1', documentNumber: '12345678', name: 'Carlos Ruiz' },
  });
});
