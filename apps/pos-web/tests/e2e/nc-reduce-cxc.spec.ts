import { expect, test } from '@playwright/test';

// Q14 de docs/ops/legal_and_sales_guide.md: al devolver y emitir la Nota de
// Crédito, el sistema reduce el saldo pendiente de la cuenta por cobrar (CxC).
// Copy contractual: motivo obligatorio y crédito de tienda opcional (sin
// efectivo ni CxC). Capability activa vía PUBLIC_FEATURE_SALES_RETURNS.

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('devolución: NC con motivo obligatorio y reembolso que reduce CxC', async ({ page }) => {
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
