import { expect, test } from '@playwright/test';

// s8 (guía §6): Modo Dueño — Finanzas consolida CxC y CxP; el diario
// contable sigue en solo lectura.

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('finanzas dueño: AR/AP con diario en solo lectura', async ({ page }) => {
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
