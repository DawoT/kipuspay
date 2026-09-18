import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Parte I §2.1/§6 (Crédito de Tienda / Gift Cards, plan Cadena): la venta del
// vale se registra como comprobante con cupo y el saldo lo impone el servidor.
// Spec con la capability activa en el snapshot del tenant.

test('vale de consumo: emisión con cupo y saldo impuesto por el servidor', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/pos/offline-sale', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ saleId: 'sale-vale-e2e', documentNumber: 'NV01-0000099' }),
    }),
  );

  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'cashier',
    capabilities: ['ledger.store_credit', 'pos.checkout'],
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'session-e2e',
    },
  });

  await page.goto('/caja/vale');
  await expect(page.getByTestId('caja-vale')).toBeVisible();
  await expect(page.getByText(/el saldo lo impone KipusPay/i)).toBeVisible();
  await expect(page.getByText('Crédito tienda')).toBeVisible();

  await page.getByTestId('caja-vale-customer').fill('20100000000');
  await page.getByTestId('caja-vale-name').fill('Cliente Vale e2e');
  await page.getByTestId('caja-vale-amount').fill('5000');
  await page.getByTestId('caja-vale-issue').click();

  await expect(page.getByTestId('caja-vale-msg')).toContainText(
    /Venta vale sale-vale-e2e · S\/ 50\.00 \(doc\+cupo\)/,
  );
});
