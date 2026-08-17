import { expect, test } from '@playwright/test';

// Sprint 39 + Sello QA Batch G: /admin/series — identidad física con
// search/lease/dispose. El search real del sello detectó 3 gaps corregidos:
// (1) el botón no disparaba el submit, (2) las disposiciones no existían en
// el contrato (SCRAPPED/RMA_SUPPLIER vs DAMAGED/LOST/RETURN_TO_SUPPLIER),
// (3) el select mapeaba mal `serial_id`. Copy honesto vía salesErrorCopy.

const SESSION = JSON.stringify({
  userId: 'owner-e2e',
  role: 'owner',
  branchId: 'branch-e2e',
});

test('series: buscar y disponer con contrato real', async ({ page }) => {
  await page.addInitScript(
    ([session]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
      localStorage.setItem('kipuspay.onboarding.claim', JSON.stringify({ branchId: 'branch-e2e' }));
      localStorage.setItem('kipuspay:pos-terminal-id', 'term-e2e');
    },
    [SESSION] as const,
  );
  const dispositions: Array<Record<string, unknown>> = [];
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.route(/\/api\/inventory\/serials\?serialNumber=/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            serial_id: 'serial-e2e',
            serial_number: 'SN-E2E-0001',
            status: 'AVAILABLE',
            product_id: 'p-e2e',
            branch_id: 'branch-e2e',
            location_id: 'loc-e2e',
            sale_item_id: null,
            updated_at: '2026-08-16 00:00:00',
          },
        ],
      }),
    }),
  );
  await page.route('**/api/inventory/serials/disposition', async (route) => {
    dispositions.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ serialId: 'serial-e2e', status: 'DAMAGED' }),
    });
  });

  await page.goto('/admin/series');
  await expect(page.getByTestId('admin-serials')).toBeVisible();
  await expect(page.getByText(/Buscar, reservar y disponer series/)).toBeVisible();
  await expect(page.getByTestId('admin-serials')).not.toContainText(
    /no están activas para este negocio/,
  );

  await page.getByRole('textbox', { name: 'Número de Serie / IMEI' }).fill('SN-E2E-0001');
  await page.getByRole('textbox', { name: 'ID de Terminal Pos' }).fill('term-e2e');
  await page.getByRole('button', { name: 'Buscar Serie' }).click();
  await expect(page.locator('#serial-select option', { hasText: 'SN-E2E-0001' })).toHaveText(
    'SN-E2E-0001 (AVAILABLE)',
  );
  await expect(page.getByText(/1 serie\(s\) encontrada\(s\)/)).toBeVisible();

  await page.selectOption('#serial-select', { label: 'SN-E2E-0001 (AVAILABLE)' });
  await expect(page.getByRole('button', { name: 'Reservar para este terminal' })).toBeVisible();

  const options = await page.locator('.disposition-group select option').allTextContents();
  expect(options).toEqual([
    'Devolver a stock',
    'Dar de baja (dañado)',
    'Registrar pérdida',
    'Devolución a proveedor',
  ]);

  await page.locator('.disposition-group select').selectOption('DAMAGED');
  await page.getByRole('button', { name: 'Confirmar Disposición' }).click();
  await expect(page.getByText(/Disposición confirmada por servidor: DAMAGED/)).toBeVisible();
  expect(dispositions.length).toBe(1);
  const body = dispositions[0];
  expect(body).toMatchObject({ serialId: 'serial-e2e', disposition: 'DAMAGED' });
  expect(JSON.stringify(body)).not.toContain('SCRAPPED');
  expect(JSON.stringify(body)).not.toContain('undefined');
});
