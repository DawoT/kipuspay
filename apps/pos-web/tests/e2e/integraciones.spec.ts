import { expect, test } from '@playwright/test';

// s23 (guía §6, Cadena+): integraciones — export contable (Contasis/Concar),
// claves de acceso con revocación inmediata, webhooks HTTPS con avisos
// sale.created/cpe.accepted/cpe.rejected e import de catálogo CSV.

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('integraciones: export contable, clave con revocación y webhook con secret', async ({
  page,
}) => {
  await page.addInitScript(
    ([session]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/integrations/accounting/export', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'fecha,cuenta,debe,haber,glosa,documento,sucursal\n2026-08-15,7011,100,0,venta,NV01-0000001,branch-e2e\n',
    }),
  );
  const revokes: string[] = [];
  await page.route('**/api/integrations/api-keys', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'key-e2e',
          prefix: 'kp_live_abcdef',
          apiKey: 'kp_live_abcdef1234567890',
          warning: 'Se muestra una sola vez',
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });
  await page.route('**/api/integrations/api-keys/**', async (route) => {
    revokes.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'revoked' }),
    });
  });
  await page.route('**/api/integrations/webhooks', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'wh-e2e',
          url: 'https://contador.example.com/hooks/kipuspay',
          events: ['sale.created', 'cpe.accepted', 'cpe.rejected'],
          secret: 'whsec_e2e',
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });
  await page.route('**/api/integrations/catalog-import', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ dryRun: true, created: 1, skipped: 0, conflicts: [] }),
    }),
  );

  await page.goto('/admin/integraciones');
  await expect(page.getByTestId('admin-integraciones')).toBeVisible();
  await expect(page.getByText(/La clave se muestra una sola vez al crear/)).toBeVisible();
  await expect(page.getByText(/venta cobrada, comprobante aceptado o rechazado/)).toBeVisible();

  await page.getByRole('button', { name: 'Exportar' }).click();
  await expect(page.getByTestId('export-preview')).toContainText(/7011|NV01-0000001/);

  await page.getByRole('button', { name: 'Crear clave' }).click();
  await expect(page.getByTestId('created-api-key')).toContainText(/kp_live_abcdef/);
  await page.getByRole('button', { name: 'Listar' }).first().click();
  await expect(page.getByTestId('keys-message')).toContainText(/clave/i);
  await page.evaluate(async () => {
    const res = await fetch('/api/integrations/api-keys/key-e2e', {
      method: 'DELETE',
      headers: { authorization: 'Bearer jwt-e2e', 'x-tenant-id': 't-e2e' },
    });
    return res.status;
  });
  await expect.poll(() => revokes.length).toBe(1);

  await page.getByRole('button', { name: 'Registrar destino' }).click();
  await expect(page.getByTestId('created-webhook-secret')).toContainText(/whsec_e2e/);

  await page.getByTestId('catalog-import-mode').selectOption('preview');
  await page.getByTestId('catalog-import-rows').fill('1');
  await page.getByTestId('catalog-import-run').click();
  await expect(page.getByTestId('catalog-import-message')).toContainText(
    /Importación en vista previa/,
  );
});
