import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Sprint 20 + Sello QA Batch G: /owner/transferencias — mercadería en
// tránsito y discrepancias al recibir, verificado real (transferencia
// IN_TRANSIT creada por API en el sello). Copy honesto, sin códigos.

test('owner transferencias: en tránsito, discrepancias y refresh', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-transfers',
    role: 'owner',
    capabilities: ['owner.mode', 'stock.transfers'],
  });
  await page.route('**/api/owner/transfers/pending', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pending: [
          {
            id: 'xfer-e2e',
            from_branch_id: 'branch-a',
            to_branch_id: 'branch-b',
            status: 'IN_TRANSIT',
            shipped_at: '2026-08-16 06:09:07',
            created_by_user_id: 'owner-e2e',
          },
        ],
        discrepancies: [],
      }),
    }),
  );

  await page.goto('/owner/transferencias');
  await expect(page.getByTestId('owner-transferencias')).toBeVisible();
  await expect(page.getByText(/Mercadería en camino y diferencias al recibir/)).toBeVisible();
  await expect(page.getByText('1 en tránsito · 0 discrepancia(s)')).toBeVisible();
  await expect(page.getByText('xfer-e2e')).toBeVisible();
  await expect(page.getByTestId('owner-xfer-pending').getByText('En camino')).toBeVisible();
  await expect(page.getByText(/Sin discrepancias recientes/)).toBeVisible();
  await expect(page.getByTestId('owner-transferencias')).not.toContainText(/IN_TRANSIT/);
});

test('owner transferencias: estado vacío honesto', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-transfers-empty',
    role: 'owner',
    capabilities: ['owner.mode', 'stock.transfers'],
  });
  await page.route('**/api/owner/transfers/pending', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pending: [], discrepancies: [] }),
    }),
  );

  await page.goto('/owner/transferencias');
  await expect(page.getByText(/Sin transferencias en tránsito/)).toBeVisible();
  await expect(
    page.getByText(/Cuando envíes mercadería entre locales, aparece aquí/),
  ).toBeVisible();
});
