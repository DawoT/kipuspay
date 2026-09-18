import { expect, test, type Page } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

async function installTenant(
  page: Page,
  caps: string[],
  vertical: 'retail' | 'farmacias' | 'restaurantes' | 'servicios' | 'cadenas' | 'grifos',
) {
  await installAuthenticatedTenant(page, {
    tenantId: 'tenant-e2e',
    capabilities: caps,
    epoch: 9,
    verticalType: vertical,
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 401, body: '{}' }));
}

test('farmacia: inventario se habilita con lotes por capability', async ({ page }) => {
  await installTenant(page, ['inventory.batches', 'inventory.bom'], 'farmacias');
  await page.goto('/admin/inventario');
  await expect(page.getByTestId('admin-inventario')).toBeVisible();
  await expect(page.getByTestId('admin-inv-off')).not.toBeVisible();
});

test('retail: cotizaciones se habilitan con sales.quotes', async ({ page }) => {
  await installTenant(page, ['sales.quotes'], 'retail');
  await page.goto('/caja/cotizacion');
  await expect(page.getByTestId('caja-cotizacion')).toBeVisible();
  await expect(page.getByTestId('caja-quote-off')).not.toBeVisible();
});

test('servicios: membresías se habilitan con sales.recurring', async ({ page }) => {
  await installTenant(page, ['sales.recurring'], 'servicios');
  await page.goto('/admin/membresias');
  await expect(page.getByTestId('memberships-root')).toBeVisible();
  await expect(page.getByText('Membresías está desactivado para este entorno.')).not.toBeVisible();
});

test('cadenas: transferencias se habilitan con stock.transfers', async ({ page }) => {
  await installTenant(page, ['stock.transfers'], 'cadenas');
  await page.goto('/admin/transferencias');
  await expect(page.getByTestId('admin-transferencias')).toBeVisible();
  await expect(page.getByTestId('admin-xfer-off')).not.toBeVisible();
});
