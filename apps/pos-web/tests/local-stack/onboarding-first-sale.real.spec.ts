import { attachEvidence, expect, queryD1, sqlText, test, posOrigin, apiOrigin } from './fixtures';

test('alta → claim → primera venta usa Worker+D1 y persiste la conciliación', async ({
  page,
}, testInfo) => {
  const endpoints: Array<{ method: string; path: string; status: number }> = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === apiOrigin) {
      endpoints.push({
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      });
    }
  });

  await page.goto('/empezar');
  await page.getByRole('textbox', { name: 'Nombre comercial' }).fill('Bodega Primera Venta Real');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Retail y minimarkets' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /Solo control interno/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  const bootstrapResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/v1/onboarding/bootstrap` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  const bootstrapResponse = await bootstrapResponsePromise;
  expect(bootstrapResponse.status()).toBe(201);
  const bootstrap = (await bootstrapResponse.json()) as {
    tenantId: string;
    branchId: string;
  };
  expect(bootstrap.tenantId).toMatch(/^t_[a-f0-9]{16}$/);

  await page.getByTestId('onboarding-go-pos').click();
  await page.waitForURL((url) => url.origin === posOrigin && url.pathname === '/');
  await expect(page.getByTestId('tenant-name')).toContainText('Bodega Primera Venta Real');
  await expect(page.getByTestId('catalog-empty-quick')).toBeVisible();
  await page.getByTestId('catalog-empty-quick').click();
  await page.getByTestId('quick-sale-name').fill('Primera venta guiada');
  await page.getByTestId('quick-sale-price').fill('15.00');
  await page.getByTestId('quick-sale-add').click();

  const syncResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/v1/sync/sales` && response.request().method() === 'POST',
  );
  await page.getByTestId('charge-btn').click();
  await expect(page.getByTestId('message')).toContainText(/^Venta .+ cobrada\.$/);
  const syncResponse = await syncResponsePromise;
  expect(syncResponse.status()).toBe(200);
  const syncBody = (await syncResponse.json()) as {
    results: readonly { offlineSaleId: string; status: string }[];
  };
  expect(syncBody.results).toHaveLength(1);
  expect(syncBody.results[0]?.status).toBe('SUCCESS');
  const offlineSaleId = syncBody.results[0]?.offlineSaleId ?? '';

  const sessionResponse = await page.request.get(`${apiOrigin}/api/auth/session`, {
    headers: {
      authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('kipuspay_token'))}`,
      'x-tenant-id': bootstrap.tenantId,
    },
  });
  expect(sessionResponse.status()).toBe(200);
  const session = (await sessionResponse.json()) as {
    role: string;
    capabilities: readonly string[];
  };
  expect(session.role).toBe('owner');
  expect(session.capabilities).toEqual(
    expect.arrayContaining(['pos.checkout', 'catalog.sellable', 'sales.quick_line']),
  );

  const persisted = await queryD1<{
    sale_id: string;
    total_amount_cents: number;
    payment_cents: number;
    is_uncatalogued: number;
    session_status: string;
  }>(`SELECT s.id AS sale_id, s.total_amount_cents,
             p.amount_cents AS payment_cents,
             i.is_uncatalogued,
             c.status AS session_status
        FROM sales s
        JOIN sale_items i ON i.tenant_id = s.tenant_id AND i.sale_id = s.id
        JOIN sale_payments p ON p.tenant_id = s.tenant_id AND p.sale_id = s.id
        JOIN cash_register_sessions c
          ON c.tenant_id = s.tenant_id AND c.id = s.cash_register_session_id
       WHERE s.tenant_id = ${sqlText(bootstrap.tenantId)}
         AND s.offline_client_sale_id = ${sqlText(offlineSaleId)}`);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]?.sale_id).toBeTruthy();
  expect(persisted[0]?.total_amount_cents).toBe(persisted[0]?.payment_cents);
  expect(persisted[0]?.is_uncatalogued).toBe(1);
  expect(persisted[0]?.session_status).toBe('OPEN');

  await attachEvidence(testInfo, 'local-stack-onboarding-first-sale', {
    environment: 'local-worker-d1',
    tenantId: bootstrap.tenantId,
    branchId: bootstrap.branchId,
    role: session.role,
    capabilities: session.capabilities,
    endpoints,
    reconciliation: syncBody,
    persisted,
  });
});
