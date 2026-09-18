import {
  apiOrigin,
  attachEvidence,
  expect,
  installKnownCashSession,
  loginSeedTenant,
  posOrigin,
  queryD1,
  sqlText,
  test,
} from './fixtures';

test('servicios cobra sin inventario y opera la recurrencia desde estado autoritativo', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'servicios');
  await installKnownCashSession(page, auth.tenantId, auth.branchId, auth.sessionId);
  await page.reload();

  await expect(page.getByTestId('add-line-seed_servicios_service')).toBeVisible();
  await page.getByTestId('add-line-seed_servicios_service').click();
  const saleResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/v1/sync/sales` && response.request().method() === 'POST',
  );
  await page.getByTestId('charge-btn').click();
  const saleResponse = await saleResponsePromise;
  const saleAck = (await saleResponse.json()) as {
    results: readonly { offlineSaleId: string; status: string }[];
  };
  expect(saleAck.results[0]?.status).toBe('SUCCESS');

  const servicePersistence = await queryD1<{
    product_type: string;
    total_amount_cents: number;
    inventory_rows: number;
  }>(`SELECT i.product_type, s.total_amount_cents,
             (SELECT COUNT(*) FROM branch_product_stock b
               WHERE b.tenant_id = s.tenant_id AND b.product_id = i.product_id) AS inventory_rows
        FROM sales s
        JOIN sale_items i ON i.tenant_id = s.tenant_id AND i.sale_id = s.id
       WHERE s.tenant_id = ${sqlText(auth.tenantId)}
         AND s.offline_client_sale_id = ${sqlText(saleAck.results[0]?.offlineSaleId ?? '')}`);
  expect(servicePersistence).toEqual([
    { product_type: 'service', total_amount_cents: 5900, inventory_rows: 0 },
  ]);

  await page.goto(`${posOrigin}/admin/membresias`);
  await page.getByTestId('memberships-branch-input').fill(auth.branchId);
  const listResponsePromise = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${apiOrigin}/api/admin/recurring-plans?`) &&
      response.request().method() === 'GET',
  );
  await page.getByTestId('memberships-refresh-btn').click();
  expect((await listResponsePromise).status()).toBe(200);
  const planCard = page
    .getByTestId('memberships-plan-card')
    .filter({ hasText: 'seed_servicios_customer' });
  await expect(planCard).toBeVisible();
  await planCard.click();

  const previewResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/recurring-plans/seed_servicios_recurring/preview') &&
      response.request().method() === 'GET',
  );
  await page.getByTestId('memberships-preview-next-btn').click();
  const previewResponse = await previewResponsePromise;
  expect(previewResponse.status()).toBe(200);
  const preview = (await previewResponse.json()) as Record<string, unknown>;

  const pauseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/recurring-plans/seed_servicios_recurring/pause') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('memberships-pause-resume-btn').click();
  expect((await pauseResponsePromise).status()).toBe(200);
  await expect(planCard).toContainText('En pausa');
  await planCard.click();

  const resumeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/recurring-plans/seed_servicios_recurring/resume') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('memberships-pause-resume-btn').click();
  expect((await resumeResponsePromise).status()).toBe(200);

  const recurringPersistence = await queryD1<{
    status: string;
    version: number;
    next_run_at: string;
  }>(`SELECT status, version, next_run_at FROM recurring_plans
    WHERE tenant_id = ${sqlText(auth.tenantId)} AND id = 'seed_servicios_recurring'`);
  expect(recurringPersistence).toHaveLength(1);
  expect(recurringPersistence[0]?.status).toBe('ACTIVE');
  expect(recurringPersistence[0]?.version).toBeGreaterThanOrEqual(3);

  await attachEvidence(testInfo, 'local-stack-services-recurring', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    saleAck,
    servicePersistence,
    preview,
    recurringPersistence,
  });
});
