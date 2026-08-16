import { expect, test } from '@playwright/test';

// s38 (guía §6): ubicaciones y racks — mover, contar y localizar producto por
// estante sin alterar el total de la sucursal; export CSV del mapa.

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('ubicaciones: mapa de racks y export CSV', async ({ page }) => {
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
  await page.route('**/api/inventory/locations?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        racks: [{ id: 'rack-a', code: 'A-01', productId: 'p-cafe', stockMicrounits: 2000000 }],
      }),
    }),
  );

  await page.goto('/admin/ubicaciones');
  await expect(page.getByTestId('admin-locations')).toBeVisible();
  await expect(
    page.getByText(/Mueve, cuenta y localiza producto por estante sin alterar el total/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Exportar CSV/ })).toBeVisible();
});
