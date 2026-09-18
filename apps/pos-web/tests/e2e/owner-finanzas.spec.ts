import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// s8 (guía §6): Modo Dueño — Finanzas consolida CxC y CxP; el diario
// contable sigue en solo lectura.

test('finanzas dueño: AR/AP con diario en solo lectura', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-finances',
    role: 'owner',
    capabilities: ['owner.mode', 'ledger.accounts_receivable', 'ledger.accounts_payable'],
  });
  await page.route('**/api/ledger/ar', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'ar-1',
            customer_id: 'cust-a',
            sale_id: 's-1',
            original_amount_cents: 5000,
            balance_due_cents: 5000,
            status: 'OPEN',
            due_date: '2026-09-01',
          },
        ],
      }),
    }),
  );
  await page.route('**/api/ledger/ap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'ap-1',
            supplier_id: 'sup-b',
            purchase_order_id: null,
            original_amount_cents: 3000,
            balance_due_cents: 3000,
            status: 'OPEN',
            due_date: '2026-09-01',
          },
        ],
      }),
    }),
  );

  await page.goto('/owner/finanzas');
  await expect(page.getByTestId('owner-finanzas')).toBeVisible();
  await expect(
    page.getByText(/Cuentas por cobrar y por pagar. El diario contable sigue en solo lectura/),
  ).toBeVisible();

  await expect(page.getByTestId('owner-finanzas')).toContainText(/S\/ 50\.00|S\/ 30\.00/);
});
