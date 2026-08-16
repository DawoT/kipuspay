import { expect, test } from '@playwright/test';

// s29/guía §6: Modo Dueño — compras: órdenes abiertas, recepciones sin
// facturar y ajustes de precio (resumen server-side).

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('compras dueño: resumen de órdenes, sin facturar y ajustes', async ({ page }) => {
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
  await page.route('**/api/owner/purchasing/three-way', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        openPurchaseOrders: [{ id: 'po-1', status: 'SENT', totalAmountCents: 15000 }],
        uninvoicedReceipts: [{ receiptId: 'rcpt-1', purchaseOrderId: 'po-1' }],
        priceDiffOverrides: [{ invoiceNumber: 'F001-1', totalCents: 100 }],
      }),
    }),
  );
  await page.route('**/api/owner/purchasing/returns', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ openReturns: [{ id: 'sr-1', receiptId: 'rcpt-1' }] }),
    }),
  );

  await page.goto('/owner/compras');
  await expect(page.getByTestId('owner-three-way')).toBeVisible();
  await expect(
    page.getByText(/Órdenes abiertas, recepciones sin facturar, devoluciones y ajustes de precio/),
  ).toBeVisible();

  await page.getByTestId('owner-three-way-refresh').click();
  await expect(page.getByTestId('owner-open-pos')).toContainText(/po-1|SENT/);
  await expect(page.getByTestId('owner-uninvoiced')).toContainText(/rcpt-1|OC po-1/);
  await expect(page.getByTestId('owner-price-diffs')).toContainText(/F001-1/);
});
