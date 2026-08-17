import { expect, test } from '@playwright/test';

// s34/GTM-20 (docs/ops/s34-supplier-returns-qg.md, guía §6): devolución a
// proveedor — crear/cerrar/cancelar; el stock sale solo al CLOSED (0 CPE).

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('devolución proveedor: crear, cerrar y cancelar', async ({ page }) => {
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
