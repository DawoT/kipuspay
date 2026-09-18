import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Parte I §4.2 de docs/ops/legal_and_sales_guide.md (arqueo por fórmula):
// "El sistema calcula lo esperado únicamente al confirmar el arqueo" — cierre
// Z ciego con conteo por denominación. El claim comercial está congelado
// (header de freeze); este spec declara explícitamente la capability del tenant.

test('cierre Z ciego: denominaciones y cálculo esperado solo al confirmar', async ({ page }) => {
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

  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'cashier',
    capabilities: ['cash.blind_z'],
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'session-e2e',
    },
  });

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
