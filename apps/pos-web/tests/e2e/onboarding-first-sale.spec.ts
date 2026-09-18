import { expect, test } from '@playwright/test';

test('onboarding claim sin sesión previa completa la primera venta', async ({ page }) => {
  const calls: string[] = [];
  const tenantId = 'tenant-first-sale-e2e';

  await page.route('**/api/onboarding/claim', async (route) => {
    calls.push('claim');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'jwt-first-sale-e2e',
        expiresAt: '2026-09-16T23:00:00.000Z',
        user: { userId: 'owner-first-sale-e2e', role: 'owner', branchId: 'branch-first-sale-e2e' },
        cashRegisterSessionId: 'cash-session-first-sale-e2e',
      }),
    });
  });
  await page.route('**/api/auth/session', async (route) => {
    calls.push('session');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-first-sale-e2e',
        role: 'owner',
        branchId: 'branch-first-sale-e2e',
        terminal: null,
        capabilities: ['catalog.sellable', 'pos.checkout'],
        capabilitiesEpoch: 1,
      }),
    });
  });
  await page.route('**/api/tenant/context', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId,
        tradeName: 'Negocio primera venta',
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
            productId: 'seed-first-sale',
            sku: 'SEED-001',
            name: 'Producto inicial',
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
  await page.route('**/api/v1/sync/sales', (route) => {
    calls.push('reconcile');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: 1 }),
    });
  });

  // No usa installAuthenticatedTenant: este recorrido debe iniciar sin token,
  // capabilities ni sesión sembrados en browser storage.
  await page.goto(
    `/?onboarding=1&tenant=${tenantId}&onboarding_token=first-sale-token&mode=INTERNAL_CONTROL&vertical=retail&name=Negocio%20primera%20venta`,
  );

  await expect(page.getByTestId('tenant-name')).toContainText('Negocio primera venta');
  await expect(page.getByTestId('add-line-seed-first-sale')).toBeVisible();
  await page.getByTestId('add-line-seed-first-sale').click();
  await page.getByTestId('charge').click();
  await expect(page.getByTestId('message')).toContainText(/^Venta .+ cobrada\.$/);

  const auth = await page.evaluate(() => ({
    token: localStorage.getItem('kipuspay_token'),
    tenantId: localStorage.getItem('kipuspay_tenant_id'),
    user: localStorage.getItem('kipuspay_user'),
    claim: localStorage.getItem('kipuspay.onboarding.claim'),
  }));
  expect(auth.token).toBe('jwt-first-sale-e2e');
  expect(auth.tenantId).toBe(tenantId);
  expect(JSON.parse(auth.user ?? '{}')).toMatchObject({ role: 'owner' });
  expect(JSON.parse(auth.claim ?? '{}')).toMatchObject({
    branchId: 'branch-first-sale-e2e',
    sessionId: 'cash-session-first-sale-e2e',
  });
  expect(calls.filter((call) => call === 'claim')).toHaveLength(1);
  expect(calls.filter((call) => call === 'session').length).toBeGreaterThan(0);
  expect(calls.filter((call) => call === 'reconcile')).toHaveLength(1);
});
