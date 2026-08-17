import { expect, test } from '@playwright/test';

// Parte I §2.1/§6 (Crédito de Tienda / Gift Cards, plan Cadena): la venta del
// vale se registra como comprobante con cupo y el saldo lo impone el servidor.
// Spec con la capability activa (PUBLIC_FEATURE_LEDGER_STORE_CREDIT=1).

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('vale de consumo: emisión con cupo y saldo impuesto por el servidor', async ({ page }) => {
  await page.addInitScript(
    ([session, claim]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay.onboarding.claim', claim);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
      localStorage.setItem('kipuspay:pos-terminal-id', 'terminal-e2e');
    },
    [SESSION, CLAIM] as const,
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'cashier-e2e',
        role: 'cashier',
        branchId: 'branch-e2e',
        terminal: { terminalId: 'terminal-e2e', terminalSessionId: 'terminal-session-e2e' },
      }),
    }),
  );
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
