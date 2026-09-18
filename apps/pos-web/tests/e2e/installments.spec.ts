import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// GTM-22 (docs/ops/legal_and_sales_guide.md §6): cuotas — cronograma CxC con
// cobro restringido a Supervisor/Dueño ("El capital baja la deuda; el interés
// no.").

test('cuotas: crear plan y cobrar cuota como supervisor', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-installments',
    role: 'supervisor',
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'cash-session-e2e',
    },
    capabilities: ['pos.checkout', 'sales.installments'],
  });
  await page.route('**/api/sales/installments', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ planId: 'plan-e2e' }),
    }),
  );
  await page.route('**/api/sales/installments/pay', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paymentId: 'pay-e2e', appliedToArCents: 3000, interestCents: 0 }),
    }),
  );

  await page.goto('/caja/cuotas');
  await expect(page.getByTestId('caja-cuotas')).toBeVisible();
  await expect(
    page.getByText(
      /Solo un supervisor o dueño cobra cuotas. El capital baja la deuda; el interés no/,
    ),
  ).toBeVisible();

  await page.getByTestId('caja-cuotas-sale').fill('sale-e2e');
  await page.getByTestId('caja-cuotas-down').fill('1000');
  await page.getByTestId('caja-cuotas-count').fill('3');
  await page.getByTestId('caja-cuotas-items').fill('3000');
  await page.getByTestId('caja-cuotas-create').click();
  await expect(page.getByTestId('caja-cuotas-msg')).toContainText(/plan-e2e/);

  await page.getByTestId('caja-cuotas-id').fill('cuota-e2e');
  await page.getByTestId('caja-cuotas-pay').click();
  await expect(page.getByTestId('caja-cuotas-msg')).toContainText(
    /Pago registrado · deuda −S\/ 30\.00/,
  );
});
