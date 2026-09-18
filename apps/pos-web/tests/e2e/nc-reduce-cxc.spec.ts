import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Q14 de docs/ops/legal_and_sales_guide.md: al devolver y emitir la Nota de
// Crédito, el sistema reduce el saldo pendiente de la cuenta por cobrar (CxC).
// Copy contractual: motivo obligatorio y crédito de tienda opcional (sin
// efectivo ni CxC). La capability se declara en el snapshot explícito del test.

test('devolución: NC con motivo obligatorio y reembolso que reduce CxC', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/sales/returns', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        returnId: 'return-e2e',
        refundCents: 11800,
        cxcReducedCents: 11800,
        documentNumber: 'NC01-0000042',
      }),
    }),
  );

  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'cashier',
    capabilities: ['sales.returns'],
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'session-e2e',
    },
  });

  await page.goto('/caja/devolucion');
  await expect(page.getByTestId('caja-devolucion')).toBeVisible();
  await expect(
    page.getByText(/Genera nota de crédito o devolución según cómo factures/),
  ).toBeVisible();
  await expect(page.getByText(/El motivo es obligatorio/)).toBeVisible();

  await page.getByTestId('caja-return-sale-id').fill('sale-origen-e2e');
  await page.getByTestId('caja-return-reason').fill('Cliente devolvió el producto');
  await page.getByTestId('caja-return-confirm').click();

  await expect(page.getByTestId('caja-return-msg')).toContainText(/NC01-0000042|return-e2e/i);
});
