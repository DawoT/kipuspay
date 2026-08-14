import { expect, test } from '@playwright/test';
import { mockSellableCatalog } from './fixtures/sellable-catalog';

test('home con checkout off muestra demo', async ({ page }) => {
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
  await page.getByTestId('add-line-p1').click();
  await expect(page.getByTestId('total')).toContainText('118.00');
});

test('home agrega productos del catálogo real y suma el total', async ({ page }) => {
  await mockSellableCatalog(page);
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await page.getByTestId('add-line-p2').click();
  await page.getByTestId('add-line-p2').click();
  await expect(page.getByTestId('total')).toContainText('50.00');
});
