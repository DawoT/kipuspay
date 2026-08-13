import type { Page } from '@playwright/test';

export const SELLABLE_ITEMS = [
  {
    productId: 'p1',
    sku: 'SKU-1',
    barcode: '1234567890128',
    name: 'Producto demo',
    productType: 'physical',
    unitPriceCents: 11800,
    costCents: 9000,
    stockMicrounits: 100000000,
    uomCode: 'UN',
    parentProductId: null,
    chargesIcbper: false,
  },
  {
    productId: 'p2',
    sku: 'SKU-2',
    barcode: null,
    name: 'Gaseosa 1L',
    productType: 'physical',
    unitPriceCents: 2500,
    costCents: 1800,
    stockMicrounits: 50000000,
    uomCode: 'UN',
    parentProductId: null,
    chargesIcbper: false,
  },
  {
    productId: 'p3',
    sku: 'SKU-3',
    barcode: null,
    name: 'Yogurt 500g',
    productType: 'physical',
    unitPriceCents: 990,
    costCents: 700,
    stockMicrounits: 30000000,
    uomCode: 'UN',
    parentProductId: null,
    chargesIcbper: false,
  },
] as const;

export async function mockSellableCatalog(page: Page): Promise<void> {
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: SELLABLE_ITEMS }),
    }),
  );
}
