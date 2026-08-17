import { expect, test } from '@playwright/test';

// guía §6: Modo Dueño — stock por variante en unidades base y alertas de
// reposición server-side.

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('stock dueño: alertas y stock por variante en unidades base', async ({ page }) => {
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
  const alertHits: string[] = [];
  await page.route('**/api/owner/stock-alerts**', (route) => {
    alertHits.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [
          { kind: 'LOW_STOCK', productId: 'p-cafe', detail: 'SKU-1 bajo', suggestReorderQty: 5 },
        ],
      }),
    });
  });
  await page.route('**/api/catalog/variants-uom', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'p-cafe',
            name: 'Café',
            sku: 'SKU-1',
            parent_product_id: null,
            stock_microunits: 0,
            uoms: [],
          },
        ],
      }),
    }),
  );

  await page.goto('/owner/stock');
  await expect(page.getByTestId('owner-stock-alerts')).toBeVisible();
  await expect(
    page.getByText(/los detalles se calculan sobre la unidad base de cada variante/),
  ).toBeVisible();

  await expect(page.getByTestId('owner-stock-alerts')).toContainText(
    /SKU-1|bajo|LOW_STOCK|1 alerta/,
  );
});
