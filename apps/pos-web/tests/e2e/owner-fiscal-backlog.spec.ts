import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

/**
 * FL-0.3 — Dueño no muestra "aceptada" si el API mock no trae CDR (PENDING).
 */
test('Dueño: backlog PENDING no dice aceptada', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-fiscal-backlog',
    role: 'owner',
    capabilities: ['owner.mode', 'fiscal.rc'],
  });
  await page.route('**/api/fiscal/owner-backlog*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            saleId: 'sale-pending',
            sunatStatus: 'PENDING',
            documentType: '01',
            totalCents: 1180,
            suggestCreditNoteEa: false,
          },
        ],
      }),
    }),
  );
  await page.goto('/owner');
  await expect(page.getByTestId('owner-fiscal-backlog')).toBeVisible();
  const badge = page.getByTestId('backlog-status');
  await expect(badge).toHaveText('Pendiente');
  await expect(badge).not.toContainText(/aceptad/i);
});
