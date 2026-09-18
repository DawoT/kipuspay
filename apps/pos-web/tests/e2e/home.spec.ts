import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';
import { mockSellableCatalog } from './fixtures/sellable-catalog';

async function installCashierHome(page: import('@playwright/test').Page, tenantId: string) {
  await installAuthenticatedTenant(page, {
    tenantId,
    role: 'cashier',
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'cash-session-e2e',
    },
    capabilities: ['catalog.sellable', 'pos.checkout'],
  });
}

test('home renderiza el total en soles', async ({ page }) => {
  await installCashierHome(page, 't-home-total');
  await mockSellableCatalog(page);
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await expect(page.getByTestId('sellable-catalog')).toBeVisible();
  await page.getByTestId('add-line-p1').click();
  await expect(page.getByTestId('total')).toContainText('139.24');
});

test('home muestra el catálogo vendible y el total al agregar', async ({ page }) => {
  await installCashierHome(page, 't-home-catalog');
  await mockSellableCatalog(page);
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await expect(page.getByTestId('sellable-catalog')).toBeVisible();
  await expect(page.getByTestId('add-line-p1')).toBeVisible();
  await page.getByTestId('add-line-p1').click();
  await expect(page.getByTestId('total')).toContainText('139.24'); // IGV 18% sobre 118.00
});

test('home refleja el estado de conexión real del terminal', async ({ page, context }) => {
  await installCashierHome(page, 't-home-connectivity');
  await page.goto('/');
  const status = page.getByTestId('connection-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('En línea');
  await context.setOffline(true);
  await expect(status).toContainText('Sin conexión');
  await context.setOffline(false);
  await expect(status).toContainText('En línea');
});
