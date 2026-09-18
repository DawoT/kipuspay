import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// s34/GTM-20 (docs/ops/s34-supplier-returns-qg.md, guía §6): devolución a
// proveedor — crear/cerrar/cancelar; el stock sale solo al CLOSED (0 CPE).

test('devolución proveedor: crear, cerrar y cancelar', async ({ page }) => {
  await page.route('**/api/purchasing/returns', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ returnId: 'sr-e2e', snapshotTotalCents: 30000, status: 'OPEN' }),
    }),
  );
  await page.route('**/api/purchasing/returns/close', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'CLOSED' }),
    }),
  );
  await page.route('**/api/purchasing/returns/cancel', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'CANCELED' }),
    }),
  );

  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'admin',
    verticalType: 'cadenas',
    tradeName: 'Cadena E2E',
    capabilities: ['purchasing.returns'],
  });

  await page.goto('/admin/devolucion-proveedor');
  await expect(page.getByTestId('admin-supplier-return')).toBeVisible();
  await expect(page.getByText(/Crear, cerrar o cancelar devoluciones/)).toBeVisible();

  await page.getByTestId('sr-receipt').fill('rcpt-e2e');
  await page.getByTestId('sr-product').fill('p-cafe');
  await page.getByTestId('sr-qty').fill('2');
  await page.getByTestId('sr-reason').fill('Mercadería dañada');
  await page.getByTestId('sr-create').click();
  await expect(page.getByTestId('sr-message')).toContainText(/Devolución sr-e2e · 300\.00/);

  await page.getByTestId('sr-id').fill('sr-e2e');
  await page.getByTestId('sr-close').click();
  await expect(page.getByTestId('sr-message')).toContainText(/Devolución cerrada/);

  await page.getByTestId('sr-id').fill('sr-e2e');
  await page.getByTestId('sr-cancel').click();
  await expect(page.getByTestId('sr-message')).toContainText(/Devolución cancelada/);
});
