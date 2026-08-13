import { expect, test } from '@playwright/test';

test('S7-H1: boleta ≥ S/700 sin identidad muestra aviso SUNAT y la identidad lo desbloquea', async ({
  page,
}) => {
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
  await page.goto('/?checkout=1');
  // Subir el total sobre el umbral (70000 cents): producto demo 11800 × 6.
  for (let i = 0; i < 6; i++) {
    await page.getByTestId('add-line').click();
  }
  await expect(page.getByTestId('id-required')).toBeVisible();

  // Con identidad completa el aviso desaparece y el cobro queda habilitado.
  await page.getByTestId('customer-doc-number').fill('12345678');
  await page.getByTestId('customer-name').fill('Cliente Real');
  await expect(page.getByTestId('id-required')).toBeHidden();
  await expect(page.getByTestId('charge')).toBeEnabled();
});
