import { expect, test } from '@playwright/test';
import { installAuthenticatedCustomerOrderFixture } from './fixtures/customer-orders.js';

test('authenticated cashier sees gated navigation and creates an unpaid reservation', async ({
  page,
}) => {
  const harness = await installAuthenticatedCustomerOrderFixture(page, 'cashier');
  await page.goto('/');
  const pickupLink = page.getByRole('link', { name: 'Pedidos retiro' });
  await expect(pickupLink).toBeVisible();
  await pickupLink.click();

  await expect(page.getByRole('heading', { name: 'Pedido con retiro' })).toBeVisible();
  await expect(
    page.getByText(/al crear el pedido no se cobra ni se emite comprobante/i),
  ).toBeVisible();
  await page.getByLabel('Cliente', { exact: true }).fill('customer-new');
  await page.getByLabel('Producto del carrito').fill('product-new');
  await page.getByRole('button', { name: 'Crear desde carrito' }).click();
  await expect(page.getByText(/Sin pago al crear/).first()).toBeVisible();
  expect(harness.lastCreateBody).not.toHaveProperty('tenantId');
  expect(JSON.stringify(harness.lastCreateBody)).not.toContain('unitPrice');
  expect(harness.lastRequestHeaders['x-terminal-id']).toBe('terminal-e2e');
  expect(harness.lastRequestHeaders['x-terminal-session-id']).toBe('terminal-session-e2e');
});

test('partial fulfillment survives offline and F5 before replay', async ({ page, context }) => {
  const harness = await installAuthenticatedCustomerOrderFixture(page, 'cashier');
  await page.goto('/orders/customer');
  await page.getByRole('button', { name: /order-e2e/ }).click();
  await page.getByLabel('Cantidad a cumplir').fill('1000000');
  await page.getByRole('button', { name: 'Preparar retiro' }).click();
  await expect(page.getByText('Cumplimiento pendiente: 1')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Cumplir parcialmente' })).toBeDisabled();
  await expect(page.getByText('Sin conexión · Datos locales desactualizados')).toBeVisible();
  await context.setOffline(false);

  await page.reload();
  await expect(page.getByText('Cumplimiento pendiente: 1')).toBeVisible();
  await page.getByRole('button', { name: /order-e2e/ }).click();
  await page.getByRole('button', { name: 'Cumplir parcialmente' }).click();
  await expect(page.getByText(/Cumplimiento confirmado/)).toBeVisible();
  expect(harness.fulfillCalls).toBe(1);
});

test('expired cached lease becomes a recoverable conflict without a sale request', async ({
  page,
}) => {
  const harness = await installAuthenticatedCustomerOrderFixture(page, 'cashier');
  harness.leaseTtlSeconds = 1;
  await page.goto('/orders/customer');
  await page.getByRole('button', { name: /order-e2e/ }).click();
  await page.getByRole('button', { name: 'Preparar retiro' }).click();
  await page.waitForTimeout(1_100);
  await page.reload();
  await page.getByRole('button', { name: /order-e2e/ }).click();
  await expect(page.getByText(/Sin reserva vigente/)).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar envío' }).click();
  await expect(page.getByRole('alert')).toContainText('Conflicto recuperable');
  expect(harness.fulfillCalls).toBe(0);
});

test('owner can read pickup queue but never sees cash-operating controls', async ({ page }) => {
  await installAuthenticatedCustomerOrderFixture(page, 'owner');
  await page.goto('/orders/customer');
  await expect(page.getByRole('link', { name: 'Pedidos retiro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'POS Terminal' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Cierre Z' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear desde carrito' })).toHaveCount(0);
  await page.getByRole('button', { name: /order-e2e/ }).click();
  await expect(page.getByText('Precio reservado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cumplir parcialmente' })).toHaveCount(0);
});

test('pickup surface fits 375px and exposes labelled 44px controls', async ({ page }) => {
  await installAuthenticatedCustomerOrderFixture(page, 'supervisor');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/orders/customer');
  await expect(page.getByLabel('Buscar por código o cliente')).toBeVisible();
  await expect(page.getByLabel('Filtrar estado')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const undersized = await page
    .locator('button:visible, input:visible, select:visible')
    .evaluateAll(
      (controls) =>
        controls.filter((control) => control.getBoundingClientRect().height < 44).length,
    );
  expect(undersized).toBe(0);
  await expect(page.locator('[aria-live="polite"]')).not.toHaveCount(0);
});
