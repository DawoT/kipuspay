import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Guía §6: gastos de caja — egresos contra la sesión abierta; no reemplaza el
// cierre Z; el arqueo se concilia al final del turno.

test('gastos de caja: registrar egreso contra la sesión', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-cash-expenses',
    role: 'cashier',
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'cash-session-e2e',
    },
    capabilities: ['cash.register_expenses', 'pos.checkout'],
  });
  await page.route('**/api/cash/expenses', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expenseId: 'exp-e2e' }),
    }),
  );

  await page.goto('/caja/gastos');
  await expect(page.getByTestId('caja-gastos')).toBeVisible();
  await expect(page.getByText(/Registra salidas de efectivo de la sesión abierta/)).toBeVisible();
  await expect(page.getByText(/No reemplaza el cierre Z/)).toBeVisible();

  await page.getByTestId('caja-gastos-cat').selectOption('SUPPLIES');
  await page.getByTestId('caja-gastos-cents').fill('2500');
  await page.getByTestId('caja-gastos-desc').fill('Compra de bolsas');
  await page.getByTestId('caja-gastos-save').click();
  await expect(page.getByTestId('caja-gastos-msg')).toContainText(/exp-e2e|registrad/i);
});
