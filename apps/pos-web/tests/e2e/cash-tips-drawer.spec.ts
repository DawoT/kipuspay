import { expect, test } from '@playwright/test';

test('P2: propina en el cobro — total con propina y tope visible', async ({ page }) => {
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
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            productId: 'p1',
            sku: 'SKU-1',
            name: 'Producto demo',
            unitPriceCents: 11800,
            costCents: 4000,
            stockMicrounits: 10000000,
            barcode: null,
            uomCode: 'NIU',
            parentProductId: null,
          },
        ],
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('tip-cents')).toBeVisible();
  await page.getByTestId('add-line').click();
  // 1 × 11800; 5% = 590 de propina
  await page.getByTestId('tip-quick-0.05').click();
  await expect(page.getByTestId('tip-cents')).toHaveValue(String(Math.round(11800 * 0.05)));
});

test('P2: política de caja en configuración — tope y cajón, guardado', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
      }),
    }),
  );
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'PATCH, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  let policyBody: Record<string, unknown> | null = null;
  await page.route('**/api/cash/policy', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ tipMaxPercent: 25, openDrawerOnCash: true }),
      });
    }
    policyBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(policyBody),
    });
  });

  await page.goto('/admin/configuracion');
  await expect(page.getByTestId('cash-policy')).toBeVisible();
  await page.getByTestId('tip-max-percent').fill('20');
  await page.getByTestId('open-drawer-on-cash').uncheck();
  await page.getByTestId('save-cash-policy').click();
  await expect(page.getByTestId('cash-policy-msg')).toContainText('guardada');
  expect(policyBody).toMatchObject({ tipMaxPercent: 20, openDrawerOnCash: false });
});

test('P2: botón "Probar cajón" en el troubleshooter', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
      }),
    }),
  );
  await page.goto('/admin/configuracion');
  await expect(page.getByTestId('hw-drawer-test')).toBeVisible();
});
