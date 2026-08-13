import { expect, test } from '@playwright/test';

test('home con checkout off muestra demo', async ({ page }) => {
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [
        { productId: 'p1', sku: 'SKU-1', name: 'Producto demo', unitPriceCents: 11800, costCents: 4000, stockMicrounits: 10000000, barcode: null, uomCode: 'NIU', parentProductId: null },
      ] }),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await page.getByTestId('add-line').click();
  await expect(page.getByTestId('total')).toContainText('118.00');
});
