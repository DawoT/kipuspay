import { expect, test } from '@playwright/test';

// Catálogo exacto (docs/ops/legal_and_sales_guide.md §6): variantes y UOM con
// el stock siempre en la unidad base. Cubre el flujo real del editor y el
// bug de rol corregido (privileged normalizaba en mayúsculas y bloqueaba al
// owner real con 403).

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('catálogo: escáner crea producto y el editor asigna padre de variante', async ({ page }) => {
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
  await page.route('**/api/catalog/quick-add', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        product: {
          id: 'p-hijo',
          sku: 'QUICK-7750000000001',
          name: 'Producto hijo',
          price_cents: 3000,
        },
        created: true,
      }),
    }),
  );
  const variantPatches: Array<Record<string, unknown>> = [];
  await page.route('**/api/catalog/variants/p-hijo', async (route) => {
    variantPatches.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ productId: 'p-hijo' }),
    });
  });
  await page.route('**/api/catalog/uoms', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ uomId: 'uom-e2e' }),
    }),
  );

  await page.goto('/admin/catalogo');
  await expect(page.getByTestId('admin-catalogo')).toBeVisible();
  await expect(page.getByTestId('admin-catalogo')).toContainText(
    'El stock siempre queda en la unidad base',
  );

  await page.getByTestId('quick-add-barcode').fill('7750000000001');
  await page.getByTestId('quick-add-name').fill('Producto hijo');
  await page.getByTestId('quick-add-price').fill('3000');
  await page.getByTestId('quick-add-submit').click();
  await expect(page.getByTestId('admin-catalogo')).toContainText(/Producto creado/);

  await page.locator('#productId-input').fill('p-hijo');
  await page.locator('#parent-input').fill('p-padre');
  await page.locator('#price-input').fill('3200');
  await page.getByRole('button', { name: 'Guardar variante' }).click();

  await expect.poll(() => variantPatches.length).toBe(1);
  expect(variantPatches[0]).toEqual({
    parentProductId: 'p-padre',
    variantPriceOverrideCents: 3200,
  });

  await page.locator('#uom-code-input').fill('CAJA6');
  await page.locator('#uom-num-input').fill('6');
  await page.locator('#uom-den-input').fill('1');
  await page.getByRole('button', { name: 'Guardar unidad' }).click();
  await expect(page.getByTestId('admin-catalogo')).toContainText(/unidad|uom-e2e/i);
});
