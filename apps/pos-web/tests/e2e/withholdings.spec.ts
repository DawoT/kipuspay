import { expect, test } from '@playwright/test';

test('P1c: Modo Dueño emite percepción y retención con montos server-side', async ({ page }) => {
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
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  let perceptionBody: Record<string, unknown> | null = null;
  await page.route('**/api/fiscal/perceptions', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    perceptionBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        series: 'P001',
        number: 12,
        baseAmountCents: 10_000,
        amountCents: 200,
        ratePercentage: 200,
        sunatStatus: 'PENDING',
      }),
    });
  });
  let retentionBody: Record<string, unknown> | null = null;
  await page.route('**/api/fiscal/retentions', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    retentionBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        series: 'R001',
        number: 12,
        baseAmountCents: 10_000,
        amountCents: 600,
        ratePercentage: 600,
        sunatStatus: 'PENDING',
      }),
    });
  });

  await page.goto('/owner');
  await page.getByTestId('wh-branch').fill('b1');
  await page.getByTestId('wh-category').selectOption('goods');
  await page.getByTestId('wh-base').fill('10000');
  await page.getByTestId('wh-sale').fill('sale-1');
  await page.getByTestId('wh-perception-submit').click();
  await expect(page.getByTestId('wh-msg')).toContainText('Percepción P001-012');
  await expect(page.getByTestId('wh-msg')).toContainText('S/ 2.00');

  await page.getByTestId('wh-invoice').fill('si-1');
  await page.getByTestId('wh-retention-submit').click();
  await expect(page.getByTestId('wh-msg')).toContainText('Retención R001-012');
  await expect(page.getByTestId('wh-msg')).toContainText('S/ 6.00');

  expect(perceptionBody).toMatchObject({
    branchId: 'b1',
    originSaleId: 'sale-1',
    series: 'P001',
    category: 'goods',
    baseAmountCents: 10_000,
  });
  expect(retentionBody).toMatchObject({
    branchId: 'b1',
    originSupplierInvoiceId: 'si-1',
    series: 'R001',
    category: 'goods',
    baseAmountCents: 10_000,
  });
});
