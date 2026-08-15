import { expect, test } from '@playwright/test';

/**
 * F-5 (auditoría browser) — /admin/backups: el onMount lee la sesión
 * autenticada vía readAdminAuthenticatedSession() (contexto que nadie
 * provee) → authenticatedFetch siempre null → toda petición falla con
 * BACKUP_AUTH_REQUIRED crudo y el historial nunca carga. El historial debe
 * renderizarse desde /api/backups sin exponer el código interno.
 */
test('F-5: el historial de respaldos carga y no expone BACKUP_AUTH_REQUIRED', async ({ page }) => {
  await page.route('**/api/backups', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'backup-1', status: 'READY' }] }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem('kipuspay_token', 'jwt-admin-e2e');
    localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    localStorage.setItem(
      'kipuspay_user',
      JSON.stringify({ userId: 'admin-e2e', role: 'admin', branchId: 'b-e2e' }),
    );
  });
  await page.goto('/admin/backups');
  await expect(page.getByText('backup-1')).toBeVisible();
  await expect(page.getByText('BACKUP_AUTH_REQUIRED')).toHaveCount(0);
});