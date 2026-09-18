import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

/**
 * F-13 (auditoría browser) — el dashboard Dueño leía el resumen del día de un
 * valor fijo (fetchDaySummary stub → siempre 0). Debe leerlo del rollup server
 * (/api/owner/day-summary, daily_financial_rollups). El server es autoritativo;
 * el banner "no en vivo" sigue aclarando que no es un dato en vivo.
 */
test('F-13: el dashboard Dueño refleja el resumen del día del servidor', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-day-summary',
    role: 'owner',
    capabilities: ['owner.mode'],
  });
  await page.route('**/api/owner/day-summary*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reportDate: '2026-08-15',
        live: false,
        source: 'daily_financial_rollups',
        totals: { grossSalesCents: 31150, netSalesCents: 31150, docCount: 2 },
        branches: [],
      }),
    }),
  );
  await page.goto('/owner');
  await expect(page.getByTestId('hoy-net')).toContainText('311.50');
  await expect(page.getByTestId('hoy-docs')).toContainText('2');
  await expect(page.getByTestId('hoy-source')).toContainText('no en vivo');
});
