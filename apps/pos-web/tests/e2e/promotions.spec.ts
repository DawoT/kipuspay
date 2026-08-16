import { expect, test } from '@playwright/test';

// GTM-15 (docs/ops/legal_and_sales_guide.md §6): promociones — descuentos y
// 2x1; el precio final lo confirma el cobro (la UI nunca es fuente de verdad
// de montos, invariante offline-first).

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('promociones: crear promoción con regla y tope de acumulación', async ({ page }) => {
  await page.addInitScript(
    ([session]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/pricing/promotions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ promotionId: 'promo-e2e' }),
    }),
  );

  await page.goto('/admin/promociones');
  await expect(page.getByTestId('admin-promociones')).toBeVisible();
  await expect(
    page.getByText(/El precio final lo confirma el cobro; en caja solo se elige la promoción/),
  ).toBeVisible();

  await page.getByTestId('promo-name').fill('2x1 Café');
  await page.getByTestId('promo-applies').selectOption('PRODUCT');
  await page.getByTestId('promo-product').fill('p-cafe');
  await page.getByTestId('promo-stack').fill('3');
  await page.getByTestId('promo-create').click();

  await expect(page.getByTestId('admin-promociones')).toContainText(/promo-e2e|cread/i);
});
