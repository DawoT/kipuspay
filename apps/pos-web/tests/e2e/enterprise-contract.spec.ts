import { expect, test, type Page } from '@playwright/test';
import { mockOnboardingClaim } from './fixtures/onboarding-claim';
import { mockSellableCatalog } from './fixtures/sellable-catalog';

async function mockPastDueSession(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
        billing: {
          subscriptionStatus: 'past_due',
          trialEndsAt: null,
          pastGracePeriod: false,
        },
      }),
    }),
  );
}

test('claim 200 → caja visible (token de onboarding)', async ({ page }) => {
  await mockOnboardingClaim(page);
  await mockPastDueSession(page);
  await page.goto('/?onboarding_token=e2e-claim-token&tenant=t-e2e');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await expect(page.getByTestId('charge')).toBeVisible();
});

test('past_due: cobro nunca responde 402', async ({ page }) => {
  const statuses: number[] = [];
  await mockOnboardingClaim(page);
  await mockPastDueSession(page);
  await mockSellableCatalog(page);
  await page.route('**/api/pos/offline-sale', (route) => {
    statuses.push(200);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, saleId: 'sale-e2e' }),
    });
  });
  await page.route('**/api/v1/sync/sales', (route) => {
    statuses.push(200);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: 1 }),
    });
  });
  await page.goto('/?onboarding_token=e2e-claim-token&tenant=t-e2e');
  await expect(page.getByTestId('add-line-p1')).toBeVisible();
  await page.getByTestId('add-line-p1').click();
  await page.getByTestId('charge').click();
  await expect(page.getByTestId('charge')).toBeVisible();
  expect(statuses.every((s) => s !== 402)).toBe(true);
  await expect(page.locator('body')).not.toContainText('402');
});

test('cancel UX: export catálogo y ventas autenticados', async ({ page }) => {
  const hits: string[] = [];
  await page.route('**/api/catalog/export**', async (route) => {
    hits.push('catalog');
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'id,sku,barcode,name,price_cents,stock,unit_code,is_active\n',
    });
  });
  await page.route('**/api/sales/export**', async (route) => {
    hits.push('sales');
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'issued_at_lima,series,number,document_type,total_amount_cents,sunat_status,void_status\n',
    });
  });
  await page.goto('/admin/configuracion');
  await expect(page.getByTestId('export-catalog')).toBeVisible();
  await expect(page.getByTestId('export-sales')).toBeVisible();
  await page.getByTestId('export-catalog').click();
  await page.getByTestId('export-sales').click();
  await expect.poll(() => hits.includes('catalog') && hits.includes('sales')).toBe(true);
});
