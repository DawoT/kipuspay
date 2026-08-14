import { expect, test } from '@playwright/test';
import { mockSellableCatalog } from './fixtures/sellable-catalog';

test('home renderiza el total en soles', async ({ page }) => {
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            productId: 'p1',
            sku: 'SKU-1',
            name: 'Producto demo',
            unitPriceCents: 11800,
            costCents: 4000,
            stockMicrounits: 10000000,
            barcode: null,
            uomCode: 'NIU',
            parentProductId: null,
          },
        ],
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await page.getByTestId('add-line').click();
});
test('home muestra el catálogo vendible y el total al agregar', async ({ page }) => {
  await mockSellableCatalog(page);
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await expect(page.getByTestId('sellable-catalog')).toBeVisible();
  await expect(page.getByTestId('add-line-p1')).toBeVisible();
  await page.getByTestId('add-line-p1').click();
  await expect(page.getByTestId('total')).toContainText('118.00');
});

test('home refleja el estado de conexión real del terminal', async ({ page, context }) => {
  await page.goto('/');
  const status = page.getByTestId('connection-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('En línea');
  await context.setOffline(true);
  await expect(status).toContainText('Sin conexión');
  await context.setOffline(false);
  await expect(status).toContainText('En línea');
});
