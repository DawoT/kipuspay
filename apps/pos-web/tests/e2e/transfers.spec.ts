import { expect, test } from '@playwright/test';

// s20 (guía §6): transferencias entre sucursales — crear, enviar, recibir o
// cancelar; conservación total origen + destino + merma (received + shrink =
// sent).

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('transferencias: crear, enviar y recibir con merma', async ({ page }) => {
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
  await page.route('**/api/inventory/transfers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'xfer-e2e', status: 'DRAFT' }),
    }),
  );
  await page.route('**/api/inventory/transfers/ship', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'IN_TRANSIT' }),
    }),
  );
  await page.route('**/api/inventory/transfers/receive', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'RECEIVED', receivedQty: 9, shrinkQty: 1 }),
    }),
  );

  await page.goto('/admin/transferencias');
  await expect(page.getByTestId('admin-transferencias')).toBeVisible();
  await expect(page.getByText(/Conservación total origen \+ destino \+ merma/)).toBeVisible();

  await page.getByTestId('xfer-from').fill('branch-a');
  await page.getByTestId('xfer-to').fill('branch-b');
  await page.getByTestId('xfer-product').fill('p-cafe');
  await page.getByTestId('xfer-qty-sent').fill('10');
  await page.getByRole('button', { name: 'Crear transferencia' }).click();
  await expect(page.getByTestId('admin-transferencias')).toContainText(
    /Transferencia creada · Borrador/,
  );

  await page.getByTestId('xfer-id').fill('xfer-e2e');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByTestId('admin-transferencias')).toContainText(/enviad|IN_TRANSIT/i);

  await page.getByTestId('xfer-id').fill('xfer-e2e');
  await page.getByTestId('xfer-line-id').fill('line-e2e');
  await page.getByTestId('xfer-qty-recv').fill('9');
  await page.getByTestId('xfer-qty-shrink').fill('1');
  await page.getByTestId('xfer-shrink-reason').fill('Daño en transporte');
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  await expect(page.getByTestId('admin-transferencias')).toContainText(/RECEIVED|recibid/i);
});
