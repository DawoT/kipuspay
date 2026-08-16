import { expect, test } from '@playwright/test';

// s20 (docs/ops/s20-cadena-transfers-qg.md, guía §6): recepción parcial de OC
// — CxP solo por cantidad recibida, PARTIALLY_RECEIVED, series por línea.
// Incluye el flujo completo standalone: crear OC con líneas → enviar → recibir.

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('OC: crear con líneas, enviar y recibir parcialmente', async ({ page }) => {
  await page.addInitScript(
    ([session]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  const poBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/purchasing/orders', async (route) => {
    poBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'po-e2e', status: 'DRAFT' }),
    });
  });
  await page.route('**/api/purchasing/orders/transition', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'SENT' }),
    }),
  );
  await page.route('**/api/purchasing/orders/partial-receive', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'PARTIALLY_RECEIVED', receiptId: 'rcpt-e2e' }),
    }),
  );

  await page.goto('/admin/oc-recepcion');
  await expect(page.getByTestId('admin-oc-receive')).toBeVisible();
  await expect(page.getByText(/La cuenta por pagar cubre solo lo recibido/)).toBeVisible();

  await page.getByTestId('admin-po-supplier').fill('s-e2e');
  await page.getByTestId('admin-po-total').fill('30000');
  await page.getByTestId('admin-po-line-product').fill('p-cafe');
  await page.getByTestId('admin-po-line-qty').fill('10');
  await page.getByTestId('admin-po-line-cost').fill('3000');
  await page.getByTestId('admin-po-line-add').click();
  await expect(page.getByTestId('admin-po-lines')).toContainText(/p-cafe · 10 × 3000/);

  await page.getByTestId('admin-po-create-btn').click();
  await expect(page.getByTestId('admin-oc-receive')).toContainText(/OC po-e2e creada/);
  expect(poBodies[0]?.lines).toEqual([{ productId: 'p-cafe', quantity: 10, unitCostCents: 3000 }]);

  await page.getByTestId('admin-po-send').click();
  await expect(page.getByTestId('admin-oc-receive')).toContainText(/OC enviada/);

  await page.getByTestId('admin-po-id').fill('po-e2e');
  await page.getByTestId('admin-po-branch').fill('branch-e2e');
  await page.getByTestId('admin-po-product').fill('p-cafe');
  await page.getByTestId('admin-po-qty').fill('5');
  await page.getByTestId('admin-po-cost').fill('3000');
  await page.getByTestId('admin-po-receive').click();
  await expect(page.getByTestId('admin-oc-receive')).toContainText(/PARTIALLY_RECEIVED|rcpt-e2e/);
});

test('OC: los errores del servidor se traducen a copy de negocio', async ({ page }) => {
  await page.addInitScript(
    ([session]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/purchasing/orders/partial-receive', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'RECEIVE_EXCEEDS_ORDERED', code: 'RECEIVE_EXCEEDS_ORDERED' }),
    }),
  );

  await page.goto('/admin/oc-recepcion');
  await page.getByTestId('admin-po-id').fill('po-e2e');
  await page.getByTestId('admin-po-branch').fill('branch-e2e');
  await page.getByTestId('admin-po-product').fill('p-cafe');
  await page.getByTestId('admin-po-qty').fill('999');
  await page.getByTestId('admin-po-cost').fill('3000');
  await page.getByTestId('admin-po-receive').click();

  await expect(page.getByTestId('admin-oc-receive')).toContainText(/más de lo ordenado/);
  await expect(page.getByTestId('admin-oc-receive')).not.toContainText(/RECEIVE_EXCEEDS_ORDERED/);
});
