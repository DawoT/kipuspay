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

test('restaurante envía comanda al KDS y divide la cuenta con persistencia atómica', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'restaurante');
  await installKnownCashSession(page, auth.tenantId, auth.branchId, auth.sessionId);
  const headers = { authorization: `Bearer ${auth.token}`, 'x-tenant-id': auth.tenantId };

  const createResponse = await page.request.post(`${apiOrigin}/api/orders`, {
    headers,
    data: {
      branchId: auth.branchId,
      tableLabel: 'E2E-42',
      items: [
        { productId: 'seed_restaurante_product', quantity: 1, unitPriceCents: 1 },
        { productId: 'seed_restaurante_product', quantity: 1, unitPriceCents: 999_999 },
      ],
    },
  });
  expect(createResponse.status()).toBe(200);
  const created = (await createResponse.json()) as { id: string; itemCount: number };
  expect(created.itemCount).toBe(2);

  const fireResponse = await page.request.post(`${apiOrigin}/api/orders/fire`, {
    headers,
    data: { orderId: created.id },
  });
  expect(fireResponse.status()).toBe(200);
  const fired = (await fireResponse.json()) as { status: string; kdsVisible: boolean };
  expect(fired.status).toBe('FIRED');

  await page.goto(`${posOrigin}/kds`);
  const card = page.getByTestId('kds-card').filter({ hasText: 'Mesa E2E-42' });
  await expect(card).toBeVisible();
  const readyResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/orders/items/ready` &&
      response.request().method() === 'POST',
  );
  await card.getByTestId('kds-ready-all').click();
  const readyResponse = await readyResponsePromise;
  expect(readyResponse.status()).toBe(200);
  const ready = (await readyResponse.json()) as { orderStatus: string; itemReadyCount: number };
  expect(ready).toMatchObject({ orderStatus: 'READY', itemReadyCount: 2 });

  const itemRows = await queryD1<{ id: string }>(`SELECT id FROM order_items
    WHERE tenant_id = ${sqlText(auth.tenantId)} AND order_id = ${sqlText(created.id)} ORDER BY id`);
  expect(itemRows).toHaveLength(2);

  await page.goto(`${posOrigin}/salon/split`);
  await page.getByTestId('split-order').fill(created.id);
  await page.getByTestId('split-item-a').fill(itemRows[0]!.id);
  await page.getByTestId('split-item-b').fill(itemRows[1]!.id);
  await page.getByTestId('split-session').fill(auth.sessionId);
  await page.getByTestId('split-pm').fill('pm-cash');
  const splitResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/orders/split` && response.request().method() === 'POST',
  );
  await page.getByTestId('split-submit').click();
  const splitResponse = await splitResponsePromise;
  expect(splitResponse.status()).toBe(200);
  const split = (await splitResponse.json()) as {
    orderStatus: string;
    portions: readonly { saleId: string; itemIds: readonly string[]; amountCents: number }[];
  };
  expect(split.orderStatus).toBe('PAID');
  expect(split.portions).toHaveLength(2);
  await expect(page.getByTestId('split-result')).toContainText('Cuenta dividida en 2 pagos');

  const persisted = await queryD1<{
    order_status: string;
    sale_count: number;
    payment_count: number;
    server_price_min_cents: number;
    server_price_max_cents: number;
  }>(`SELECT o.status AS order_status,
             COUNT(DISTINCT s.id) AS sale_count,
             COUNT(DISTINCT p.id) AS payment_count,
             MIN(i.unit_price_cents) AS server_price_min_cents,
             MAX(i.unit_price_cents) AS server_price_max_cents
        FROM orders o
        JOIN order_items i ON i.tenant_id = o.tenant_id AND i.order_id = o.id
        JOIN sales s ON s.tenant_id = o.tenant_id AND s.id = i.sale_id
        JOIN sale_payments p ON p.tenant_id = s.tenant_id AND p.sale_id = s.id
       WHERE o.tenant_id = ${sqlText(auth.tenantId)} AND o.id = ${sqlText(created.id)}`);
  expect(persisted).toEqual([
    {
      order_status: 'PAID',
      sale_count: 2,
      payment_count: 2,
      server_price_min_cents: 1180,
      server_price_max_cents: 1180,
    },
  ]);

  await attachEvidence(testInfo, 'local-stack-restaurant-kds-split', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    created,
    fired,
    ready,
    split,
    persisted,
    fiscalClaim: 'not-tested-no-sunat-acceptance-claimed',
  });
});
