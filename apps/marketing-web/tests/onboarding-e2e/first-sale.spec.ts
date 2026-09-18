import { expect, test } from '@playwright/test';

const POS_ORIGIN = 'http://127.0.0.1:4179';
const TENANT_ID = 'tenant-first-sale-flow-e2e';
const ONBOARDING_TOKEN = 'synthetic-onboarding-token';

test('alta guiada cruza al POS y llega a la primera venta sin sesión preinyectada', async ({
  page,
}) => {
  const requests: Array<{ endpoint: string; body: unknown }> = [];

  await page.route('**/v1/onboarding/bootstrap', async (route) => {
    requests.push({ endpoint: 'bootstrap', body: route.request().postDataJSON() });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId: TENANT_ID,
        ownerBadge: 'EMP-90001',
        ownerPin: '4937',
        onboardingToken: ONBOARDING_TOKEN,
      }),
    });
  });
  await page.route('**/api/onboarding/claim', async (route) => {
    requests.push({ endpoint: 'claim', body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'synthetic-session-jwt',
        expiresAt: '2026-09-16T23:00:00.000Z',
        user: {
          userId: 'owner-first-sale-flow-e2e',
          role: 'owner',
          branchId: 'branch-first-sale-flow-e2e',
        },
        cashRegisterSessionId: 'cash-session-first-sale-flow-e2e',
      }),
    });
  });
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-first-sale-flow-e2e',
        role: 'owner',
        branchId: 'branch-first-sale-flow-e2e',
        terminal: null,
        capabilities: ['catalog.sellable', 'pos.checkout'],
        capabilitiesEpoch: 1,
      }),
    }),
  );
  await page.route('**/api/tenant/context', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId: TENANT_ID,
        tradeName: 'Bodega Primera Venta',
        verticalType: 'retail',
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
      }),
    }),
  );
  await page.route('**/api/catalog/sellable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            productId: 'seed-product-first-sale',
            sku: 'SEED-001',
            name: 'Arroz de prueba',
            unitPriceCents: 10000,
            costCents: 6000,
            stockMicrounits: 10000000,
            barcode: null,
            uomCode: 'NIU',
            parentProductId: null,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/branches/branch-first-sale-flow-e2e/series', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ series: [] }),
    }),
  );
  await page.route('**/api/v1/sync/sales', async (route) => {
    requests.push({ endpoint: 'sale-reconciliation', body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: 1 }),
    });
  });
  await page.route('**/api/growth/events', (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/empezar');
  await expect(page.getByTestId('onboarding-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Prepara tu negocio para empezar a vender.',
  );
  await page.getByRole('textbox', { name: 'Nombre comercial' }).fill('Bodega Primera Venta');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Retail y minimarkets' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /Solo control interno/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Primera venta guiada')).toBeVisible();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByTestId('onboarding-credentials')).toContainText('EMP-90001');
  await page.getByTestId('onboarding-go-pos').click();

  await page.waitForURL((url) => url.origin === POS_ORIGIN && url.pathname === '/');
  await expect(page.getByTestId('tenant-name')).toContainText('Bodega Primera Venta');
  await expect(page.getByTestId('add-line-seed-product-first-sale')).toBeVisible();
  await page.getByTestId('add-line-seed-product-first-sale').click();
  await page.getByTestId('charge').click();
  await expect(page.getByTestId('message')).toContainText(/^Venta .+ cobrada\.$/);
  await expect
    .poll(() => requests.some((request) => request.endpoint === 'sale-reconciliation'))
    .toBeTruthy();

  expect(requests.find((request) => request.endpoint === 'bootstrap')?.body).toMatchObject({
    tradeName: 'Bodega Primera Venta',
    verticalType: 'retail',
    formalizationMode: 'INTERNAL_CONTROL',
  });
  expect(requests.find((request) => request.endpoint === 'claim')?.body).toEqual({
    token: ONBOARDING_TOKEN,
  });
  expect(new URL(page.url()).searchParams.has('onboarding_token')).toBe(false);
  expect(page.url()).not.toContain('4937');

  const session = await page.evaluate(() => ({
    tenantId: localStorage.getItem('kipuspay_tenant_id'),
    token: localStorage.getItem('kipuspay_token'),
    claim: localStorage.getItem('kipuspay.onboarding.claim'),
  }));
  expect(session.tenantId).toBe(TENANT_ID);
  expect(session.token).toBe('synthetic-session-jwt');
  expect(JSON.parse(session.claim ?? '{}')).toMatchObject({
    tenantId: TENANT_ID,
    branchId: 'branch-first-sale-flow-e2e',
    sessionId: 'cash-session-first-sale-flow-e2e',
  });
});
