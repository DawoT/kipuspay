import { expect, test } from '@playwright/test';

// GTM-21 (docs/ops/legal_and_sales_guide.md §2.1/§6): crédito de tienda — el
// vale se emite en Caja; el panel admin ajusta o expira el saldo del cliente.

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('crédito tienda: ajuste de saldo y expiración desde el panel admin', async ({ page }) => {
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
  await page.route('**/api/ledger/store-credit/adjust', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nextBalanceCents: 15000 }),
    }),
  );
  await page.route('**/api/ledger/store-credit/expire', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'EXPIRED' }),
    }),
  );

  await page.goto('/admin/credito-tienda');
  await expect(page.getByTestId('admin-store-credit')).toBeVisible();
  await expect(
    page.getByText(/El vale se emite en Caja. Aquí solo ajustas o expiras el saldo del cliente/),
  ).toBeVisible();

  await page.getByTestId('sc-customer').fill('customer-e2e');
  await page.getByTestId('sc-amount').fill('5000');
  await page.getByTestId('sc-adjust').click();
  await expect(page.getByTestId('admin-store-credit')).toContainText(
    /Ajuste Abono aplicado · saldo 150\.00/,
  );

  await page.getByTestId('sc-expire').click();
  await expect(page.getByTestId('admin-store-credit')).toContainText(/expir/i);
});
