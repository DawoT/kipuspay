import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

test('caja: venta rápida agrega línea genérica sin bloquear el cobro', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-quick-sale',
    role: 'cashier',
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'cash-session-e2e',
    },
    capabilities: ['catalog.quick_add', 'onboarding.tour', 'pos.checkout', 'sales.quick_line'],
  });
  await page.goto('/');
  // El tour del S52 se abre en la demo (capability quick_add); se cierra para
  // no interferir con el dialog de venta rápida.
  if (await page.getByTestId('tour').isVisible()) {
    await page.getByTestId('tour-next').click();
  }
  await page.getByTestId('quick-sale').click();
  await expect(page.getByRole('dialog', { name: 'Venta rápida sin catálogo' })).toBeVisible();
  await page.getByTestId('quick-sale-name').fill('Empanada de queso');
  await page.getByTestId('quick-sale-price').fill('1500');
  await page.getByTestId('quick-sale-add').click();
  await expect(page.getByText('Empanada de queso')).toBeVisible();
  await expect(page.getByTestId('charge')).toBeEnabled();
});

test('catálogo: escáner rápido crea/actualiza producto y rechaza EMP-', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-quick-add',
    role: 'owner',
    capabilities: ['catalog.quick_add'],
  });
  let quickAddBody: Record<string, unknown> | null = null;
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  await page.route('**/api/catalog/quick-add', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    quickAddBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    const reserved = String(quickAddBody.barcode).startsWith('EMP-');
    return route.fulfill({
      status: reserved ? 422 : 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(
        reserved
          ? { code: 'RESERVED_BARCODE', error: 'EMP- es namespace de vendedores' }
          : { product: { id: 'p9' }, created: true },
      ),
    });
  });
  await page.goto('/admin/catalogo');
  await expect(page.getByTestId('quick-add-panel')).toBeVisible();
  await page.getByTestId('quick-add-barcode').fill('1234567890128');
  await page.getByTestId('quick-add-name').fill('Nuevo');
  await page.getByTestId('quick-add-price').fill('1500');
  await page.getByTestId('quick-add-submit').click();
  await expect(page.getByTestId('quick-add-message')).toContainText('Producto creado');
  expect(quickAddBody).toMatchObject({ barcode: '1234567890128', name: 'Nuevo', priceCents: 1500 });

  await page.getByTestId('quick-add-barcode').fill('EMP-12345');
  await page.getByTestId('quick-add-name').fill('Nuevo');
  await page.getByTestId('quick-add-price').fill('1500');
  await page.getByTestId('quick-add-submit').click();
  await expect(page.getByTestId('quick-add-message')).toContainText('EMP- es namespace');
});
