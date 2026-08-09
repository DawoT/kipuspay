import { expect, test } from '@playwright/test';
import { installRecurringSalesFixture } from './fixtures/recurring-sales.js';

test('authenticated Admin creates FIXED without tenant, money or payment authority', async ({
  page,
}) => {
  const harness = await installRecurringSalesFixture(page, 'admin');
  await page.goto('/admin/membresias');
  await expect(page.getByRole('heading', { name: 'Membresías' })).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar calendario' }).click();
  await page.getByLabel('Cliente').fill('customer-new');
  await page.getByLabel('Producto o servicio').fill('service-new');
  await page.getByLabel('Unidad', { exact: true }).fill('uom-new');
  await page.getByLabel('Semántica de precio').selectOption('FIXED');
  await page.getByRole('button', { name: 'Crear con precio del servidor' }).click();
  expect(harness.created).toHaveLength(1);
  expect(harness.created[0]).not.toHaveProperty('tenantId');
  expect(JSON.stringify(harness.created[0])).not.toMatch(
    /unitPriceCents|totalAmountCents|balanceDueCents|card|paymentToken/i,
  );
});

test('CURRENT preview shows server calendar and catalog semantics', async ({ page }) => {
  await installRecurringSalesFixture(page, 'owner');
  await page.goto('/admin/membresias');
  await page.getByRole('button', { name: 'Actualizar calendario' }).click();
  await page.getByRole('button', { name: /customer-e2e/ }).click();
  await page.getByRole('button', { name: 'Vista previa de próxima ejecución' }).click();
  await expect(page.getByText('CURRENT · Precio del servidor')).toBeVisible();
  await expect(page.getByText(/CURRENT puede cambiar con el catálogo/)).toBeVisible();
});

test('pause and resume use optimistic versions', async ({ page }) => {
  const harness = await installRecurringSalesFixture(page, 'admin');
  await page.goto('/admin/membresias');
  await page.getByRole('button', { name: 'Actualizar calendario' }).click();
  await page.getByRole('button', { name: /customer-e2e/ }).click();
  await page.getByRole('button', { name: 'Pausar membresía' }).click();
  await page.getByRole('button', { name: /customer-e2e/ }).click();
  await page.getByRole('button', { name: 'Reanudar membresía' }).click();
  expect(harness.transitions).toEqual(['pause', 'resume']);
});

test('immediate cancellation requires server preview and explicit confirm', async ({ page }) => {
  const harness = await installRecurringSalesFixture(page, 'owner');
  await page.goto('/admin/membresias');
  await page.getByRole('button', { name: 'Actualizar calendario' }).click();
  await page.getByRole('button', { name: /customer-e2e/ }).click();
  await page.getByRole('button', { name: 'Cancelar ahora y calcular crédito' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar cancelación inmediata' })).toBeFocused();
  await expect(page.getByText('Nota de crédito')).toBeVisible();
  expect(harness.immediateConfirmed).toBe(false);
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  expect(harness.immediateConfirmed).toBe(true);
});

test('cash roles fail closed and 375px Admin controls remain accessible', async ({ page }) => {
  await installRecurringSalesFixture(page, 'cashier');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/membresias');
  await expect(page.getByRole('alert')).toContainText('Solo Owner o Admin');
  await expect(page.getByRole('link', { name: 'Membresías' })).toHaveCount(0);
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
});
