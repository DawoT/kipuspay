import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

/**
 * F-2 (auditoría browser) — Alertas Dueño: los fetches de stock-alerts,
 * payments/uncaptured y layaways/overdue deben llevar x-tenant-id. Sin el
 * hint, el middleware del worker responde 403 TENANT_HINT_MISMATCH.
 */
test('F-2: Alertas Dueño envía x-tenant-id a las 3 APIs', async ({ page }) => {
  const seenTenantIds: (string | null)[] = [];
  const patterns = [
    '**/api/owner/stock-alerts*',
    '**/api/owner/payments/uncaptured*',
    '**/api/owner/layaways/overdue*',
  ];
  for (const pattern of patterns) {
    await page.route(pattern, (route) => {
      seenTenantIds.push(route.request().headers()['x-tenant-id'] ?? null);
      void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  }
  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'owner',
    branchId: 'b-e2e',
    capabilities: ['owner.mode'],
  });
  await page.goto('/owner/alertas');
  await expect(page.getByTestId('owner-alertas')).toBeVisible();
  await expect(page.getByTestId('alertas-empty')).toBeVisible();
  expect(seenTenantIds).toHaveLength(3);
  for (const hint of seenTenantIds) {
    expect(hint, 'x-tenant-id en la petición').toBe('t-e2e');
  }
});
