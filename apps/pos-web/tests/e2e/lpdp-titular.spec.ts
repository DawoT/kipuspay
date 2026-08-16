import { expect, test } from '@playwright/test';

// Sprint C3 — LPDP ARCO self-serve del titular (regla 32a / GTM-09): el
// cliente verifica identidad con datos (tienda + DNI + nombre + teléfono) y
// ejercita sus derechos (copia, consentimientos, anonimización con doble
// confirmación). Ruta pública: el token de titular jamás habilita el admin.

test('titular: verificación por datos y descarga de la copia', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/lpdp/titular/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'titular-token-e2e', expiresInSeconds: 900 }),
    }),
  );
  await page.route('**/api/lpdp/titular/consents', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust-1',
        consents: [{ purpose: 'marketing', granted: true }],
      }),
    }),
  );
  const exportCalls: string[] = [];
  await page.route('**/api/lpdp/titular/export', async (route) => {
    exportCalls.push(route.request().headers()['authorization'] ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust-1',
        profile: { documentNumber: '45123456', name: 'Ana' },
        consents: [],
        sales: [],
      }),
    });
  });

  await page.goto('/lpdp');
  await expect(page.getByTestId('lpdp-titular')).toBeVisible();
  await expect(page.getByTestId('lpdp-verify')).toBeVisible();

  await page.getByTestId('lpdp-tenant').fill('t-e2e');
  await page.getByTestId('lpdp-doc').fill('45123456');
  await page.getByTestId('lpdp-name').fill('Ana Perez');
  await page.getByTestId('lpdp-phone').fill('+51999999999');
  await page.getByTestId('lpdp-verify-btn').click();

  await expect(page.getByTestId('lpdp-panel')).toBeVisible();
  await expect(page.getByText('marketing')).toBeVisible();
  await expect(page.getByText('Con consentimiento')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('lpdp-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('mis-datos-');
  expect(exportCalls).toEqual(['Bearer titular-token-e2e']);
});

test('titular: identidad incorrecta no pasa (fail-closed)', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/lpdp/titular/verify', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'TITULAR_IDENTITY_MISMATCH',
        code: 'TITULAR_IDENTITY_MISMATCH',
      }),
    }),
  );

  await page.goto('/lpdp');
  await page.getByTestId('lpdp-doc').fill('45123456');
  await page.getByTestId('lpdp-name').fill('Otra Persona');
  await page.getByTestId('lpdp-phone').fill('+51999999999');
  await page.getByTestId('lpdp-tenant').fill('t-e2e');
  await page.getByTestId('lpdp-verify-btn').click();

  await expect(page.getByTestId('lpdp-alert')).toContainText(/Los datos no coinciden/);
  await expect(page.getByTestId('lpdp-verify')).toBeVisible();
});

test('titular: anonimización exige doble confirmación', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/lpdp/titular/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'titular-token-e2e', expiresInSeconds: 900 }),
    }),
  );
  await page.route('**/api/lpdp/titular/consents', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ customerId: 'cust-1', consents: [] }),
    }),
  );
  const eraseBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/lpdp/titular/erase', async (route) => {
    eraseBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust-1',
        fiscalSnapshotsAnonymized: 3,
        consentsRevoked: 2,
      }),
    });
  });

  await page.goto('/lpdp');
  await page.getByTestId('lpdp-tenant').fill('t-e2e');
  await page.getByTestId('lpdp-doc').fill('45123456');
  await page.getByTestId('lpdp-name').fill('Ana Perez');
  await page.getByTestId('lpdp-phone').fill('+51999999999');
  await page.getByTestId('lpdp-verify-btn').click();
  await expect(page.getByTestId('lpdp-panel')).toBeVisible();

  await page.getByTestId('lpdp-erase-start').click();
  await expect(page.getByTestId('lpdp-erase-go')).toBeDisabled();
  await page.getByTestId('lpdp-erase-confirm').check();
  await page.getByTestId('lpdp-erase-go').click();
  await expect(page.getByTestId('lpdp-msg')).toContainText(/anonimizados/);

  expect(eraseBodies).toHaveLength(1);
  expect(eraseBodies[0]).toEqual({ confirmed: true });
});
