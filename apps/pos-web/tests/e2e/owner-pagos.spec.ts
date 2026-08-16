import { expect, test } from '@playwright/test';

// s22 (guía §6): Modo Dueño — pagos no conciliados (tarjeta/billetera) hasta
// conciliarlos; el dueño ve el pendiente server-side.

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('pagos dueño: pendientes no conciliados con refresh', async ({ page }) => {
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
  await page.route(/\/api\/owner\/payments\/uncaptured/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uncaptured: [
          {
            id: 'pay-1',
            sale_id: 's-1',
            acquirer: 'yape',
            status: 'MANUAL',
            amount_cents: 1850,
            acquirer_ref: null,
          },
        ],
      }),
    }),
  );

  await page.goto('/owner/pagos');
  await expect(page.getByTestId('owner-payments-uncaptured')).toBeVisible();
  await expect(page.getByText(/Pagos con captura manual y pendientes de conciliar/)).toBeVisible();

  await page.getByTestId('owner-pay-refresh').click();
  await expect(page.getByTestId('owner-pay-list')).toContainText(/pay-1|En revisión|yape/);
});
