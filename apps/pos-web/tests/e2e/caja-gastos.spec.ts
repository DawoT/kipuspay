import { expect, test } from '@playwright/test';

// Guía §6: gastos de caja — egresos contra la sesión abierta; no reemplaza el
// cierre Z; el arqueo se concilia al final del turno.

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('gastos de caja: registrar egreso contra la sesión', async ({ page }) => {
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
