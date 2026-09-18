import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// s8/guía §6: Modo Dueño — locales: ranking por sucursal calculado por el
// servidor, con resumen guardado offline.

test('locales dueño: ranking por sucursal server-side', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-locales',
    role: 'owner',
    capabilities: ['owner.mode', 'reporting.catalog'],
  });
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

  // Opción B (auditoría, menor riesgo): contrato entrega branch_id técnico sin GET /api/branches;
  // fallback a id — expect valida b-1|b-2. No inventar displayName sin spec.
  await expect(page.getByTestId('branch-ranking')).toContainText(/b-1|b-2/);
});
