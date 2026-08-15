import { expect, test } from '@playwright/test';

// Parte I §3.3 de docs/ops/legal_and_sales_guide.md: toda Nota de Venta impresa
// lleva la leyenda "NOTA DE VENTA — Documento de control interno no válido
// para fines tributarios". La caja de un tenant INTERNAL_CONTROL solo emite NV.

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('ticket de NV imprime la leyenda de control interno (cero engaño fiscal)', async ({
  page,
}) => {
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
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );
  await page.route('**/api/pos/offline-sale', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ saleId: 'sale-e2e', documentNumber: 'NV01-0000099' }),
    }),
  );
  await page.route('**/api/v1/sync/sales', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Venta rápida (sin catálogo)' }).click();
  await page.getByTestId('quick-sale-name').fill('Producto de prueba');
  await page.getByTestId('quick-sale-price').fill('10.00');
  await page.getByTestId('quick-sale-add').click();
  await page
    .getByRole('button', { name: /^Cobrar/ })
    .first()
    .click();

  await expect(
    page.getByText('NOTA DE VENTA — Documento de control interno no válido para fines tributarios'),
  ).toBeVisible();
  await expect(page.getByText('TOTAL: S/ 11.80')).toBeVisible();
});
