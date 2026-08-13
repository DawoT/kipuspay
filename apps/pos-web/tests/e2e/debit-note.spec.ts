import { expect, test } from '@playwright/test';

test('P1a: el Modo Dueño emite una nota de débito y muestra serie-número', async ({ page }) => {
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
  let sentBody: Record<string, unknown> | null = null;
  await page.route('**/api/sales/debit-notes', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    sentBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        debitNoteId: 'dn-1',
        series: 'FC01',
        number: 42,
        amountCents: 5900,
        motiveCode: '02',
        mustSubmitByIso: '2026-08-16T00:00:00.000Z',
        requiresNoCdrAudit: false,
      }),
    });
  });

  await page.goto('/owner');
  await page.getByTestId('dn-origin').fill('sale-1');
  await page.getByTestId('dn-series').fill('FC01');
  await page.getByTestId('dn-motive').selectOption('02');
  await page.getByTestId('dn-amount').fill('5900');
  await page.getByTestId('dn-desc').fill('Aumento de valor');
  await page.getByTestId('dn-submit').click();
  await expect(page.getByTestId('dn-msg')).toContainText('FC01-042');
  await expect(page.getByTestId('dn-msg')).toContainText('motivo 02');
  expect(sentBody).toMatchObject({
    originSaleId: 'sale-1',
    series: 'FC01',
    motiveCode: '02',
    amountCents: 5900,
    description: 'Aumento de valor',
  });
});
