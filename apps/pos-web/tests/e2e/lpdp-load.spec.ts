import { expect, test } from '@playwright/test';
import { installAuthenticatedLpdpFixture } from './fixtures/lpdp.js';

// Sello QA Batch H: /admin/clientes (LPDP). La lista NO se carga
// automáticamente (patrón de privacidad: no exponer PII sin acción del
// operador). El Sello detectó copy contradictorio: el estado inicial decía
// "No hay clientes para esta sucursal" cuando aún no se cargaba nada y la
// API lista el tenant completo (no la sucursal). Fix: guía honesta
// "Pulsa Actualizar..." en el estado inicial y "esta cuenta" en el vacío.

test('H: estado inicial honesto y carga explícita de la lista', async ({ page }) => {
  await installAuthenticatedLpdpFixture(page, 'owner');
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(page.getByText(/Pulsa Actualizar para cargar los clientes/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/No hay clientes para esta sucursal/);

  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText(/2 clientes en esta cuenta/)).toBeVisible();
  await expect(page.getByRole('button', { name: /12345678/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /00000000/ })).toBeVisible();
});
