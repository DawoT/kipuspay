import { expect, test } from '@playwright/test';

// GTM-14 (docs/ops/legal_and_sales_guide.md §2.1/§6): apartados — reserva
// mercadería con adelantos; el comprobante nace solo al convertir a venta.
// Incluye el contrato de copy de errores: cero códigos técnicos al operador
// (F-5/V-27, salesErrorCopy).

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('apartado: crear con abono, abonar y convertir a venta', async ({ page }) => {
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
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/sales/layaways', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        depositId: 'layaway-e2e',
        snapshotTotalCents: 10000,
        emitsFiscalDocument: false,
      }),
    }),
  );
  await page.route('**/api/sales/layaways/deposit', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balanceAfterCents: 4000 }),
    }),
  );
  await page.route('**/api/sales/layaways/convert', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ saleId: 'sale-convertida-e2e' }),
    }),
  );

  await page.goto('/caja/apartado');
  await expect(page.getByTestId('caja-apartado')).toBeVisible();
  await expect(page.getByText(/El comprobante nace solo al convertir a venta/)).toBeVisible();

  await page.getByTestId('layaway-product').fill('p1');
  await page.getByTestId('layaway-qty').fill('1');
  await page.getByTestId('layaway-initial').fill('1000');
  await page.getByTestId('layaway-create').click();
  await expect(page.getByTestId('layaway-msg')).toContainText(/Apartado listo/);

  await page.getByTestId('layaway-id').fill('layaway-e2e');
  await page.getByTestId('layaway-extra').fill('5000');
  await page.getByTestId('layaway-deposit').click();
  await expect(page.getByTestId('layaway-msg')).toContainText(/Abono OK · saldo S\/ 40\.00/);

  await page.getByTestId('layaway-series').fill('NV01');
  await page.getByTestId('layaway-convert').click();
  await expect(page.getByTestId('layaway-msg')).toContainText(
    /Convertido a venta sale-convertida-e2e/,
  );
});

test('apartado: el error del servidor se traduce a copy de negocio (nunca código)', async ({
  page,
}) => {
  await page.addInitScript(
    ([session, claim]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay.onboarding.claim', claim);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION, CLAIM] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/sales/layaways', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'PRODUCT_NOT_FOUND', code: 'PRODUCT_NOT_FOUND' }),
    }),
  );

  await page.goto('/caja/apartado');
  await page.getByTestId('layaway-product').fill('p-inexistente');
  await page.getByTestId('layaway-qty').fill('1');
  await page.getByTestId('layaway-initial').fill('1000');
  await page.getByTestId('layaway-create').click();

  await expect(page.getByTestId('layaway-msg')).toContainText(/producto no existe en tu catálogo/);
  await expect(page.getByTestId('layaway-msg')).not.toContainText(/PRODUCT_NOT_FOUND/);
});
