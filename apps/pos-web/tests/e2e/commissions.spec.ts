import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// GTM-23 (docs/ops/legal_and_sales_guide.md §6): comisiones de vendedor —
// tasas y pagos; los montos los confirma el cobro (server-side).

test('comisiones: tasa por vendedor y creación de pago pendiente', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-commissions',
    role: 'admin',
    capabilities: ['sales.commissions'],
  });
  await page.route('**/api/admin/commissions/rates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rateId: 'rate-e2e' }),
    }),
  );
  await page.route('**/api/admin/commissions/payouts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ payoutId: 'payout-e2e', status: 'PENDING' }),
    }),
  );

  await page.goto('/admin/comisiones');
  await expect(page.getByTestId('admin-commissions')).toBeVisible();
  await expect(page.getByText(/Los montos los confirma el cobro/)).toBeVisible();

  await page.getByTestId('comm-seller').fill('seller-e2e');
  await page.getByTestId('comm-rate').fill('5');
  await page.getByTestId('comm-upsert-rate').click();
  await expect(page.getByTestId('admin-commissions')).toContainText(/rate-e2e|guardad/i);

  await page.getByTestId('comm-period-start').fill('2026-08-01');
  await page.getByTestId('comm-period-end').fill('2026-08-31');
  await page.getByTestId('comm-create-payout').click();
  await expect(page.getByTestId('admin-commissions')).toContainText(/payout-e2e|pendiente/i);
});
