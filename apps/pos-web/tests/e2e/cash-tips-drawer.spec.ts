import { expect, test } from '@playwright/test';
import { mockSellableCatalog } from './fixtures/sellable-catalog';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

test('P2: propina en el cobro — total con propina y tope visible', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-cash-tips',
    role: 'cashier',
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'cash-session-e2e',
    },
    capabilities: ['cash.policy', 'pos.checkout', 'catalog.sellable'],
  });
  await mockSellableCatalog(page);
  await page.goto('/');
  await expect(page.getByTestId('tip-cents')).toBeVisible();
  await page.getByTestId('add-line-p1').click();
  await page.getByTestId('add-line-p1').click();
  // 2 × 11800 = 23600 net; IGV 18% => payable 27848; 5% sobre payable = 1392 (no sobre total sin IGV)
  const payableCents = 23600 + Math.round((23600 * 18) / 100);
  await page.getByTestId('tip-quick-0.05').click();
  await expect(page.getByTestId('tip-cents')).toHaveValue(String(Math.round(payableCents * 0.05)));
});

test('P2: política de caja en configuración — tope y cajón, guardado', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-cash-policy',
    role: 'owner',
    capabilities: ['cash.policy'],
  });
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

  const sessionResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/session'),
  );
  await page.goto('/admin/configuracion');
  const bootstrap = await sessionResponse;
  expect(bootstrap.status()).toBe(200);
  expect(await bootstrap.json()).toMatchObject({ capabilities: ['cash.policy'] });
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('kipuspay.capabilities.v1:t-cash-policy') ?? ''),
    )
    .toContain('cash.policy');
  await expect(page.getByTestId('cash-policy')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Impresora, balanza y vitrina' })).toHaveCount(0);
  await page.getByTestId('tip-max-percent').fill('20');
  await page.getByTestId('open-drawer-on-cash').uncheck();
  await page.getByTestId('save-cash-policy').click();
  await expect(page.getByTestId('cash-policy-msg')).toContainText('guardada');
  expect(policyBody).toMatchObject({ tipMaxPercent: 20, openDrawerOnCash: false });
});

test('P2: botón "Probar cajón" en el troubleshooter', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-cash-drawer',
    role: 'owner',
    capabilities: ['cash.policy', 'hardware.diagnostics'],
  });
  await page.goto('/admin/configuracion');
  await expect(page.getByTestId('hw-drawer-test')).toBeVisible();
});
