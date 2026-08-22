import { expect, test } from '@playwright/test';

/**
 * FL-0.3 — Dueño no muestra "aceptada" si el API mock no trae CDR (PENDING).
 */
test('Dueño: backlog PENDING no dice aceptada', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
      }),
    }),
  );
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
  await page.addInitScript(() => {
    localStorage.setItem('kipuspay_token', 'jwt-owner-e2e');
    localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    localStorage.setItem(
      'kipuspay_user',
      JSON.stringify({ userId: 'owner-e2e', role: 'owner', branchId: 'branch-e2e' }),
    );
  });
  await page.goto('/owner');
  await expect(page.getByTestId('owner-fiscal-backlog')).toBeVisible();
  const badge = page.getByTestId('backlog-status');
  await expect(badge).toHaveText('Pendiente');
  await expect(badge).not.toContainText(/aceptad/i);
});
