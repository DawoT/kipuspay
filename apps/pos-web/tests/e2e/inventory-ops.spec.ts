import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// s38-41 (docs/ops/legal_and_sales_guide.md §6): inventario — hoja ciega de
// conteo físico (sin stock esperado hasta el review) y merma con evidencia +
// aprobación.

test('inventario: conteo ciego y merma con aprobación', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'admin',
    verticalType: 'farmacias',
    tradeName: 'Farmacia E2E',
    capabilities: ['inventory.batches', 'inventory.bom'],
  });
  await page.route('**/api/inventory/counts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'count-e2e', status: 'COUNTING' }),
    }),
  );
  await page.route('**/api/inventory/losses', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'loss-e2e', status: 'PENDING' }),
    }),
  );
  await page.route('**/api/inventory/losses/approve', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'APPROVED' }),
    }),
  );

  await page.goto('/admin/inventario');
  await expect(page.getByTestId('admin-inventario')).toBeVisible();
  await expect(page.getByText(/Hoja ciega de conteo físico y registro de mermas/)).toBeVisible();
  await expect(
    page.getByText(/no muestra stock esperado en hoja ciega hasta el review/),
  ).toBeVisible();

  await page.getByTestId('admin-inv-branch').fill('branch-e2e');
  await page.getByTestId('admin-inv-product').fill('p-cafe');
  await page.getByTestId('admin-inv-counted').fill('8');
  await page.getByTestId('admin-inv-count-start').click();
  await expect(page.getByTestId('admin-inventario')).toContainText(/count-e2e|COUNTING/);

  await page.getByTestId('admin-inv-loss-qty').fill('1');
  await page.getByTestId('admin-inv-evidence').fill('evidencia.jpg');
  await page.getByTestId('admin-inv-reason').fill('Merma por manipulación');
  await page.getByTestId('admin-inv-loss-create').click();
  await expect(page.getByTestId('admin-inventario')).toContainText(/loss-e2e|PENDING/);

  await page.getByTestId('admin-inv-loss-id').fill('loss-e2e');
  await page.getByTestId('admin-inv-loss-approve').click();
  await expect(page.getByTestId('admin-inventario')).toContainText(/APPROVED/);
});
