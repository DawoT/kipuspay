import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

/** F-5: el historial autorizado carga sin exponer códigos internos. */
test('F-5: el historial de respaldos carga y no expone BACKUP_AUTH_REQUIRED', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-backups',
    role: 'admin',
    branchId: 'b-e2e',
    capabilities: ['data.backup'],
  });
  await page.route('**/api/backups', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'backup-1', status: 'READY' }] }),
    }),
  );
  await page.goto('/admin/backups');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('kipuspay.capabilities.v1:t-backups') ?? ''),
    )
    .toContain('data.backup');
  await expect(page.getByText('backup-1')).toBeVisible();
  await expect(page.getByText('BACKUP_AUTH_REQUIRED')).toHaveCount(0);
});
