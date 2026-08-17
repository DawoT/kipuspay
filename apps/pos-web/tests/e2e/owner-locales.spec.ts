import { expect, test } from '@playwright/test';

// s8/guía §6: Modo Dueño — locales: ranking por sucursal calculado por el
// servidor, con resumen guardado offline.

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('locales dueño: ranking por sucursal server-side', async ({ page }) => {
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
  await page.route('**/api/owner/day-summary**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totals: { grossSalesCents: 500000, netSalesCents: 500000, docCount: 42 },
        branches: [
          { branch_id: 'b-1', net_sales_cents: 300000, doc_count: 25 },
          { branch_id: 'b-2', net_sales_cents: 200000, doc_count: 17 },
        ],
        rankingClaimFrozen: false,
      }),
    }),
  );

  await page.goto('/owner/locales');
  await expect(page.getByTestId('owner-locales')).toBeVisible();
  await expect(page.getByText(/Ranking por sucursal calculado por el servidor/)).toBeVisible();
  await expect(page.getByText(/Sin red se muestra el último resumen guardado/)).toBeVisible();

  await expect(page.getByTestId('branch-ranking')).toContainText(/Local 1|Local 2/);
});
