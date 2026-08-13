import { expect, test } from '@playwright/test';

test('offline sync: encolar N → sync background → cola vacía (cero spinner cobro)', async ({
  page,
}) => {
  // El harness apunta a la API de sync; por CSP del POS solo puede conectar
  // al mismo origin ('self'), así que se redirige a localhost:4173 y el route
  // mock responde como transporte sano (F6-2): cada venta ack SUCCESS.
  await page.addInitScript(() => {
    localStorage.setItem('kipuspay_api_base', window.location.origin);
  });
  await page.route('**/api/v1/sync/sales', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
    }
    const body = route.request().postDataJSON() as { sales: Array<{ offlineSaleId: string }> };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: (body.sales ?? []).map((sale) => ({
          offlineSaleId: sale.offlineSaleId,
          status: 'SUCCESS',
        })),
      }),
    });
  });
  await page.goto('/dev/offline-sync-harness');
  await expect(page.getByRole('heading', { name: 'Offline sync harness' })).toBeVisible();

  const syncRequests: string[] = [];
  page.on('console', (msg) => syncRequests.push(`CONSOLE ${msg.type()}: ${msg.text()}`));
  page.on('request', (req) => {
    syncRequests.push(`${req.method()} ${req.url()}`);
  });
  page.on('requestfailed', (req) => {
    syncRequests.push(`FAILED ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });

  await page.getByTestId('run').click();
  // Cobro y sync en background completan atómicamente.
  await expect(page.getByTestId('status')).toHaveText('synced', { timeout: 10_000 });
  await expect(page.getByTestId('message')).toContainText('Cola vacía tras sync');
  await expect(page.getByTestId('pending')).toHaveText('0');
  expect(syncRequests.length, `requests: ${JSON.stringify(syncRequests)}`).toBeGreaterThan(0);
});
