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

test('venta sembrada descuenta stock una vez y la reconciliación es idempotente', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'retail');
  await installKnownCashSession(page, auth.tenantId, auth.branchId, auth.sessionId);
  await page.reload();

  const initialStock = await queryD1<{
    stock_microunits: number;
    location_microunits: number;
    batch_microunits: number;
  }>(`SELECT b.stock_microunits,
             l.quantity_microunits AS location_microunits,
             lb.quantity_microunits AS batch_microunits
        FROM branch_product_stock b
        JOIN inventory_location_stock l
          ON l.tenant_id = b.tenant_id AND l.branch_id = b.branch_id
         AND l.product_id = b.product_id
        JOIN inventory_location_batch_stock lb
          ON lb.tenant_id = b.tenant_id AND lb.branch_id = b.branch_id
         AND lb.location_id = l.location_id AND lb.product_id = b.product_id
       WHERE b.tenant_id = ${sqlText(auth.tenantId)}
         AND b.product_id = 'seed_retail_product'`);
  expect(initialStock).toHaveLength(1);

  await expect(page.getByTestId('add-line-seed_retail_product')).toBeVisible();
  await page.getByTestId('add-line-seed_retail_product').click();

  let syncPayload: { sales?: readonly Record<string, unknown>[] } | undefined;
  page.on('request', (request) => {
    if (request.url() === `${apiOrigin}/api/v1/sync/sales` && request.method() === 'POST') {
      syncPayload = request.postDataJSON() as { sales?: readonly Record<string, unknown>[] };
    }
  });
  const syncResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/v1/sync/sales` && response.request().method() === 'POST',
  );
  await page.getByTestId('charge-btn').click();
  const syncResponse = await syncResponsePromise;
  expect(syncResponse.status()).toBe(200);
  const firstAck = (await syncResponse.json()) as {
    results: readonly { offlineSaleId: string; status: string; saleId?: string }[];
  };
  expect(firstAck.results).toHaveLength(1);
  expect(firstAck.results[0]?.status).toBe('SUCCESS');
  expect(syncPayload?.sales).toHaveLength(1);

  const offlineSaleId = firstAck.results[0]?.offlineSaleId ?? '';
  const afterFirst = await queryD1<{
    sale_count: number;
    stock_microunits: number;
    location_microunits: number;
    batch_microunits: number;
    payment_cents: number;
    total_amount_cents: number;
  }>(`SELECT COUNT(DISTINCT s.id) AS sale_count,
             b.stock_microunits,
             l.quantity_microunits AS location_microunits,
             lb.quantity_microunits AS batch_microunits,
             p.amount_cents AS payment_cents,
             s.total_amount_cents
        FROM sales s
        JOIN sale_payments p ON p.tenant_id = s.tenant_id AND p.sale_id = s.id
        JOIN branch_product_stock b
          ON b.tenant_id = s.tenant_id AND b.branch_id = s.branch_id
         AND b.product_id = 'seed_retail_product'
        JOIN inventory_location_stock l
          ON l.tenant_id = b.tenant_id AND l.branch_id = b.branch_id
         AND l.product_id = b.product_id
        JOIN inventory_location_batch_stock lb
          ON lb.tenant_id = b.tenant_id AND lb.branch_id = b.branch_id
         AND lb.location_id = l.location_id AND lb.product_id = b.product_id
       WHERE s.tenant_id = ${sqlText(auth.tenantId)}
         AND s.offline_client_sale_id = ${sqlText(offlineSaleId)}`);
  expect(afterFirst).toHaveLength(1);
  expect(afterFirst[0]?.sale_count).toBe(1);
  expect(afterFirst[0]?.stock_microunits).toBe(initialStock[0]!.stock_microunits - 1_000_000);
  expect(afterFirst[0]?.location_microunits).toBe(initialStock[0]!.location_microunits - 1_000_000);
  expect(afterFirst[0]?.batch_microunits).toBe(initialStock[0]!.batch_microunits - 1_000_000);
  expect(afterFirst[0]?.payment_cents).toBe(afterFirst[0]?.total_amount_cents);

  const replayResponse = await page.request.post(`${apiOrigin}/api/v1/sync/sales`, {
    headers: {
      authorization: `Bearer ${auth.token}`,
      'x-tenant-id': auth.tenantId,
    },
    data: syncPayload,
  });
  expect(replayResponse.status()).toBe(200);
  const replayAck = (await replayResponse.json()) as {
    results: readonly { offlineSaleId: string; status: string; saleId?: string }[];
  };
  expect(replayAck.results).toEqual([
    expect.objectContaining({ offlineSaleId, status: 'ALREADY_SYNCED' }),
  ]);

  const afterReplay = await queryD1<{
    sale_count: number;
    stock_microunits: number;
    location_microunits: number;
    batch_microunits: number;
  }>(`SELECT COUNT(DISTINCT s.id) AS sale_count,
             b.stock_microunits,
             l.quantity_microunits AS location_microunits,
             lb.quantity_microunits AS batch_microunits
        FROM sales s
        JOIN branch_product_stock b
          ON b.tenant_id = s.tenant_id AND b.branch_id = s.branch_id
         AND b.product_id = 'seed_retail_product'
        JOIN inventory_location_stock l
          ON l.tenant_id = b.tenant_id AND l.branch_id = b.branch_id
         AND l.product_id = b.product_id
        JOIN inventory_location_batch_stock lb
          ON lb.tenant_id = b.tenant_id AND lb.branch_id = b.branch_id
         AND lb.location_id = l.location_id AND lb.product_id = b.product_id
       WHERE s.tenant_id = ${sqlText(auth.tenantId)}
         AND s.offline_client_sale_id = ${sqlText(offlineSaleId)}`);
  expect(afterReplay).toEqual([
    expect.objectContaining({
      sale_count: 1,
      stock_microunits: afterFirst[0]!.stock_microunits,
      location_microunits: afterFirst[0]!.location_microunits,
      batch_microunits: afterFirst[0]!.batch_microunits,
    }),
  ]);

  await attachEvidence(testInfo, 'local-stack-seeded-sale-idempotency', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    firstAck,
    replayAck,
    initialStock,
    afterFirst,
    afterReplay,
  });
});
