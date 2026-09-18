import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

test('cambiar tenant revalida el catálogo y vacía el carrito anterior', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 'tenant-catalog-a',
    capabilities: ['catalog.sellable', 'pos.checkout'],
  });
  const tenantsSeen: string[] = [];
  const sessionTenantsSeen: string[] = [];
  await page.route('**/api/auth/session', async (route) => {
    const tenantId = route.request().headers()['x-tenant-id'] ?? '';
    sessionTenantsSeen.push(tenantId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'cashier-e2e',
        role: 'cashier',
        branchId: 'branch-e2e',
        terminal: null,
        capabilities: ['catalog.sellable', 'pos.checkout'],
        capabilitiesEpoch: tenantId === 'tenant-catalog-b' ? 2 : 1,
      }),
    });
  });
  await page.route('**/api/catalog/sellable', async (route) => {
    const tenantId = route.request().headers()['x-tenant-id'] ?? '';
    tenantsSeen.push(tenantId);
    const productId = tenantId === 'tenant-catalog-b' ? 'product-b' : 'product-a';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            productId,
            sku: productId.toUpperCase(),
            name: productId === 'product-b' ? 'Producto B' : 'Producto A',
            productType: 'physical',
            unitPriceCents: 1000,
            costCents: 500,
            stockMicrounits: 1_000_000,
            barcode: null,
            uomCode: 'NIU',
            parentProductId: null,
            chargesIcbper: false,
          },
        ],
      }),
    });
  });

  await page.goto('/');
  await page.getByTestId('add-line-product-a').click();
  await expect(page.getByTestId('cart-item-count')).toContainText('1 ítem');

  await page.evaluate(() => {
    const oldValue = localStorage.getItem('kipuspay_tenant_id');
    localStorage.setItem('kipuspay_tenant_id', 'tenant-catalog-b');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'kipuspay_tenant_id',
        oldValue,
        newValue: 'tenant-catalog-b',
        storageArea: localStorage,
      }),
    );
  });

  await expect(page.getByTestId('add-line-product-b')).toBeVisible();
  await expect(page.getByTestId('cart-item-count')).toContainText('0 ítems');
  expect(tenantsSeen).toContain('tenant-catalog-a');
  expect(tenantsSeen).toContain('tenant-catalog-b');
  expect(sessionTenantsSeen).toContain('tenant-catalog-b');
});

test('cambiar token revalida sesión y borra carrito al revocar catalog.sellable', async ({
  page,
}) => {
  await installAuthenticatedTenant(page, {
    tenantId: 'tenant-catalog-token',
    capabilities: ['catalog.sellable', 'pos.checkout'],
  });

  const sessionRequests: Array<{ tenantId: string; authorization: string }> = [];
  await page.route('**/api/auth/session', async (route) => {
    const headers = route.request().headers();
    sessionRequests.push({
      tenantId: headers['x-tenant-id'] ?? '',
      authorization: headers.authorization ?? '',
    });
    if (headers.authorization === 'Bearer jwt-revoked-e2e') {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'cashier-e2e',
        role: 'cashier',
        branchId: 'branch-e2e',
        terminal: null,
        capabilities:
          headers.authorization === 'Bearer jwt-revoked-e2e'
            ? ['pos.checkout']
            : ['catalog.sellable', 'pos.checkout'],
        capabilitiesEpoch: headers.authorization === 'Bearer jwt-revoked-e2e' ? 2 : 1,
      }),
    });
  });
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            productId: 'product-token',
            sku: 'TOKEN-1',
            name: 'Producto revocable',
            productType: 'physical',
            unitPriceCents: 1000,
            costCents: 500,
            stockMicrounits: 1_000_000,
            barcode: null,
            uomCode: 'NIU',
            parentProductId: null,
            chargesIcbper: false,
          },
        ],
      }),
    }),
  );

  await page.goto('/');
  await page.getByTestId('add-line-product-token').click();
  await expect(page.getByTestId('cart-item-count')).toContainText('1 ítem');

  await page.evaluate(() => {
    const oldValue = localStorage.getItem('kipuspay_token');
    localStorage.setItem('kipuspay_token', 'jwt-revoked-e2e');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'kipuspay_token',
        oldValue,
        newValue: 'jwt-revoked-e2e',
        storageArea: localStorage,
      }),
    );
  });

  await expect(page.getByRole('searchbox', { name: 'Buscar productos' })).toBeHidden();
  await expect(page.getByText('Catálogo desactivado')).toBeVisible();
  await expect(page.getByTestId('cart-item-count')).toContainText('0 ítems');
  await expect(page.getByText('Catálogo desactivado')).toBeVisible();
  await expect(page.getByTestId('cart-item-count')).toContainText('0 ítems');
  expect(sessionRequests).toContainEqual({
    tenantId: 'tenant-catalog-token',
    authorization: 'Bearer jwt-revoked-e2e',
  });
});
