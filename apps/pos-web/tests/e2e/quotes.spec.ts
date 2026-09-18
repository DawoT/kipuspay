import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// GTM-19 (docs/ops/legal_and_sales_guide.md §6): cotizaciones — congelan el
// precio del servidor, no reservan stock ni emiten comprobante hasta convertir
// a venta.

test('cotización: contrato de congelado de precio y acciones de gestión', async ({ page }) => {
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

  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'cashier',
    capabilities: ['sales.quotes'],
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'cash-session-e2e',
    },
  });

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
