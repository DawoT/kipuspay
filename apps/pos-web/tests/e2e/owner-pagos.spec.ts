import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// s22 (guía §6): Modo Dueño — pagos no conciliados (tarjeta/billetera) hasta
// conciliarlos; el dueño ve el pendiente server-side.

test('pagos dueño: pendientes no conciliados con refresh', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-payments',
    role: 'owner',
    capabilities: ['owner.mode', 'payments.qr_wallets'],
  });
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
