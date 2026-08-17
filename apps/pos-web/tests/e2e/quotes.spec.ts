import { expect, test } from '@playwright/test';

// GTM-19 (docs/ops/legal_and_sales_guide.md §6): cotizaciones — congelan el
// precio del servidor, no reservan stock ni emiten comprobante hasta convertir
// a venta.

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('cotización: contrato de congelado de precio y acciones de gestión', async ({ page }) => {
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
  await page.route('**/api/sales/quotes', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quoteId: 'quote-e2e', snapshotTotalCents: 10000 }),
    }),
  );
  await page.route('**/api/sales/quotes/send', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'SENT' }),
    }),
  );
  await page.route('**/api/sales/quotes/approve', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'APPROVED' }),
    }),
  );

  await page.goto('/caja/cotizacion');
  await expect(page.getByTestId('caja-cotizacion')).toBeVisible();
  await expect(
    page.getByText(/Congela el precio del servidor. No reserva stock ni emite comprobante/),
  ).toBeVisible();

  await page.getByTestId('quote-product').fill('p1');
  await page.getByTestId('quote-qty').fill('1');
  await page.getByTestId('quote-valid').fill('2026-09-15');
  await page.getByTestId('quote-create').click();
  await expect(page.getByTestId('quote-msg')).toContainText(/quote-e2e|S\/ 100\.00/);

  await page.getByTestId('quote-id').fill('quote-e2e');
  await page.getByTestId('quote-send').click();
  await expect(page.getByTestId('quote-msg')).toContainText(/Enviada/);

  await page.getByTestId('quote-approve').click();
  await expect(page.getByTestId('quote-msg')).toContainText(/Aprobada/);
});
