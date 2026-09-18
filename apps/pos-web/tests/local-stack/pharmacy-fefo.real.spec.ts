import {
  apiOrigin,
  attachEvidence,
  expect,
  installKnownCashSession,
  loginSeedTenant,
  queryD1,
  sqlText,
  test,
} from './fixtures';

test('farmacia aplica FEFO y rechaza un producto cuyo único lote está vencido', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'farmacia');
  await installKnownCashSession(page, auth.tenantId, auth.branchId, auth.sessionId);
  await page.reload();

  await expect(page.getByTestId('add-line-seed_farmacia_fefo_product')).toBeVisible();
  await page.getByTestId('add-line-seed_farmacia_fefo_product').click();
  const validResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/v1/sync/sales` && response.request().method() === 'POST',
  );
  await page.getByTestId('charge-btn').click();
  const validResponse = await validResponsePromise;
  const validAck = (await validResponse.json()) as {
    results: readonly { offlineSaleId: string; status: string; code?: string }[];
  };
  expect(validAck.results[0]?.status).toBe('SUCCESS');

  const fefoPersistence = await queryD1<{
    batch_id: string;
    early_microunits: number;
    late_microunits: number;
  }>(`SELECT i.batch_id,
             early.stock_microunits AS early_microunits,
             late.stock_microunits AS late_microunits
        FROM sales s
        JOIN sale_items i ON i.tenant_id = s.tenant_id AND i.sale_id = s.id
        JOIN inventory_batches early
          ON early.tenant_id = s.tenant_id AND early.id = 'seed_farmacia_fefo_batch_early'
        JOIN inventory_batches late
          ON late.tenant_id = s.tenant_id AND late.id = 'seed_farmacia_fefo_batch_late'
       WHERE s.tenant_id = ${sqlText(auth.tenantId)}
         AND s.offline_client_sale_id = ${sqlText(validAck.results[0]?.offlineSaleId ?? '')}`);
  expect(fefoPersistence).toEqual([
    {
      batch_id: 'seed_farmacia_fefo_batch_early',
      early_microunits: 1_000_000,
      late_microunits: 5_000_000,
    },
  ]);

  await page.reload();
  await expect(page.getByTestId('add-line-seed_farmacia_expired_product')).toBeVisible();
  await page.getByTestId('add-line-seed_farmacia_expired_product').click();
  const expiredResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/v1/sync/sales` && response.request().method() === 'POST',
  );
  await page.getByTestId('charge-btn').click();
  const expiredResponse = await expiredResponsePromise;
  const expiredAck = (await expiredResponse.json()) as {
    results: readonly { offlineSaleId: string; status: string; code?: string }[];
  };
  expect(expiredAck.results[0]?.status).toBe('FAILED');
  expect(expiredAck.results[0]?.code).toMatch(/expired|vencid/i);

  const expiredPersistence = await queryD1<{
    sale_count: number;
    batch_microunits: number;
    location_batch_microunits: number;
  }>(`SELECT COUNT(DISTINCT s.id) AS sale_count,
             b.stock_microunits AS batch_microunits,
             lb.quantity_microunits AS location_batch_microunits
        FROM inventory_batches b
        JOIN inventory_location_batch_stock lb
          ON lb.tenant_id = b.tenant_id AND lb.batch_id = b.id
        LEFT JOIN sales s
          ON s.tenant_id = b.tenant_id
         AND s.offline_client_sale_id = ${sqlText(expiredAck.results[0]?.offlineSaleId ?? '')}
       WHERE b.tenant_id = ${sqlText(auth.tenantId)}
         AND b.id = 'seed_farmacia_expired_batch'`);
  expect(expiredPersistence).toEqual([
    { sale_count: 0, batch_microunits: 3_000_000, location_batch_microunits: 3_000_000 },
  ]);

  await attachEvidence(testInfo, 'local-stack-pharmacy-fefo', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    validAck,
    fefoPersistence,
    expiredAck,
    expiredPersistence,
  });
});
