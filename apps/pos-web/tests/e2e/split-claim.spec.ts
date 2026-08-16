import { expect, test } from '@playwright/test';

// Sello QA Batch G: /salon/split — la división de cuenta depende de
// comandas (KDS, "en preparación" según la guía). Este spec protege el
// claim congelado: si alguien descongela el split sin actualizar la guía,
// se pone RED (mismo contrato que frozen-features).

test('G: split de salón permanece desactivado (claim congelado)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'kipuspay_user',
      JSON.stringify({ userId: 'cashier-e2e', role: 'cashier', branchId: 'branch-e2e' }),
    );
    localStorage.setItem('kipuspay_token', 'jwt-e2e');
    localStorage.setItem('kipuspay_tenant_id', 't-e2e');
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/salon/split');
  await expect(page.getByTestId('split-root')).toBeVisible();
  await expect(page.getByTestId('split-off')).toBeVisible();
  await expect(
    page.getByText('La división de cuenta no está activa para esta tienda.'),
  ).toBeVisible();
  await expect(page.getByTestId('split')).not.toBeVisible();
});
