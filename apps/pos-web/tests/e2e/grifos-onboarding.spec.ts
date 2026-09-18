import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

test('grifos: el tenant elegido carga el despacho con catálogo server-side', async ({ page }) => {
  const dispatches: Array<Record<string, unknown>> = [];
  let dispatchAttempts = 0;
  await page.route('**/api/tenant/context', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId: 'tenant-grifos',
        tradeName: 'Grifo Central',
        verticalType: 'grifos',
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
      }),
    }),
  );
  await page.route('**/api/fuel/catalog', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            code: 'DIESEL_B5',
            name: 'Diésel B5',
            priceCentsPerGallon: 1500,
            igvRateBps: 1800,
            detractionRateBps: 1000,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/fuel/dispatches', async (route) => {
    dispatchAttempts += 1;
    dispatches.push(route.request().postDataJSON() as Record<string, unknown>);
    if (dispatchAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'CAPABILITIES_UNAVAILABLE' }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        dispatchId: 'dispatch-grifos-e2e',
        totalCents: 17700,
        detractionCents: 1770,
      }),
    });
  });
  await installAuthenticatedTenant(page, {
    tenantId: 'tenant-grifos',
    role: 'owner',
    branchId: 'branch-grifos',
    verticalType: 'grifos',
    tradeName: 'Grifo Central',
    epoch: 4,
    capabilities: ['pos.checkout', 'fuel.dispatch', 'fiscal.withholdings'],
    onboardingClaim: { branchId: 'branch-grifos', sessionId: 'cash-session-grifos' },
  });

  await page.goto('/');
  await expect(page.getByTestId('fuel-dispatch-card')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('fuel-price')).toContainText('15.00');
  await page.getByTestId('fuel-gallons').fill('10');
  await expect(page.getByTestId('fuel-preview')).toContainText('177.00');
  await page.getByTestId('fuel-island').selectOption('isla-2');
  await page.getByTestId('fuel-plate').fill('ABC-123');
  await page.getByTestId('fuel-charge').click();
  await expect(page.getByTestId('fuel-error')).toContainText('No se pudo confirmar');
  await page.getByTestId('fuel-charge').click();

  await expect.poll(() => dispatches).toHaveLength(2);
  expect(dispatches[0]).toMatchObject({
    fuelCode: 'DIESEL_B5',
    volumeMicrounits: 10_000_000,
    islandId: 'isla-2',
    nozzleId: 'isla-2',
    paymentMethod: 'cash',
    branchId: 'branch-grifos',
    cashRegisterSessionId: 'cash-session-grifos',
    plate: 'ABC-123',
  });
  expect(dispatches[0]?.dispatchId).toEqual(expect.any(String));
  expect(dispatches[0]?.idempotencyKey).toEqual(expect.any(String));
  expect(dispatches[1]?.dispatchId).toBe(dispatches[0]?.dispatchId);
  expect(dispatches[1]?.idempotencyKey).toBe(dispatches[0]?.idempotencyKey);
});
