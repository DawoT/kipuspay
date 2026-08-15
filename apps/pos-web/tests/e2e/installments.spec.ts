import { expect, test } from '@playwright/test';

// GTM-22 (docs/ops/legal_and_sales_guide.md §6): cuotas — cronograma CxC con
// cobro restringido a Supervisor/Dueño ("El capital baja la deuda; el interés
// no.").

const SESSION = JSON.stringify({
  userId: 'supervisor-e2e',
  role: 'supervisor',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('cuotas: crear plan y cobrar cuota como supervisor', async ({ page }) => {
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
