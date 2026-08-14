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

test('past_due post-gracia: banner de gestión pausada; owner premium → 402', async ({ page }) => {
  const ownerStatuses: number[] = [];
  await mockOnboardingClaim(page);
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
          pastGracePeriod: true,
        },
      }),
    }),
  );
  await page.route('**/api/insights/briefing**', (route) => {
    ownerStatuses.push(402);
    route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'SUBSCRIPTION_INACTIVE', error: 'Payment Required' }),
    });
  });
  await page.route('**/api/owner/**', (route) => {
    ownerStatuses.push(402);
    route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'SUBSCRIPTION_INACTIVE', error: 'Payment Required' }),
    });
  });
  await page.goto('/?onboarding_token=e2e-claim-token&tenant=t-e2e');
  await expect(page.getByTestId('billing-banner')).toContainText('herramientas de gestión están pausadas');
  await expect(page.getByTestId('charge')).toBeVisible();
  await page.goto('/owner');
  await expect.poll(() => ownerStatuses.some((s) => s === 402)).toBe(true);
});

/**
 * Dual-app handshake: marketing construye el redirect; el POS claima el token.
 * Staging real: export E2E_STAGING_BOOTSTRAP_TOKEN (+ opcional E2E_STAGING_TENANT).
 * Sin env, mocks locales cubren el contrato claim→caja.
 */
test('empezar→bootstrap→claim: redirect con token (dual-app)', async ({ page }) => {
  const claimHits: string[] = [];
  const useStaging = Boolean(process.env.E2E_STAGING_BOOTSTRAP_TOKEN);

  await page.route('**/api/onboarding/claim', async (route) => {
    claimHits.push(route.request().url());
    if (useStaging) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'jwt-from-bootstrap',
        expiresAt: '2026-08-14T23:00:00.000Z',
        user: { userId: 'owner-e2e', role: 'owner', branchId: 'branch-e2e' },
        cashRegisterSessionId: 'session-e2e',
      }),
    });
  });
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
        billing: { subscriptionStatus: 'trial', trialEndsAt: null, pastGracePeriod: false },
      }),
    }),
  );

  const token = process.env.E2E_STAGING_BOOTSTRAP_TOKEN ?? 'e2e-bootstrap-token';
  const tenant = process.env.E2E_STAGING_TENANT ?? 't-e2e';
  await page.goto(
    `/?onboarding=1&tenant=${tenant}&onboarding_token=${token}&mode=INTERNAL_CONTROL&vertical=retail&name=Demo`,
  );
  await expect.poll(() => claimHits.length).toBeGreaterThan(0);
  await expect(page.getByTestId('tenant-name')).toBeVisible();
});
