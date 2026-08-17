import { expect, test } from '@playwright/test';

// Parte I §4.2 de docs/ops/legal_and_sales_guide.md (arqueo por fórmula):
// "El sistema calcula lo esperado únicamente al confirmar el arqueo" — cierre
// Z ciego con conteo por denominación. El claim comercial está congelado
// (header de freeze); este spec sella el contrato de software con la
// capability activa (PUBLIC_FEATURE_CASH_BLIND_Z=1 en el env del webserver).

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('cierre Z ciego: denominaciones y cálculo esperado solo al confirmar', async ({ page }) => {
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
  await page.route('**/api/cash/sessions/blind-close', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        expectedTotalCents: 11800,
        differenceAmountCents: 0,
        message: 'Arqueo cerrado',
      }),
    }),
  );

  await page.goto('/caja');
  await expect(page.getByTestId('caja-blind-z')).toBeVisible();
  await expect(
    page.getByText('El sistema calcula lo esperado únicamente al confirmar el arqueo.'),
  ).toBeVisible();
  await expect(page.getByText('Denominación (PEN)')).toBeVisible();

  await page.getByTestId('caja-denom-10000').fill('1');
  await page.getByTestId('caja-confirm-z').click();

  await expect(page.getByTestId('caja-z-status')).toHaveText('cerrado');
  await expect(page.getByTestId('caja-z-expected')).toContainText('S/ 118.00');
});
