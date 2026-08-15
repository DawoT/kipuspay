import { expect, test } from '@playwright/test';

// Sello QA (Sprint 58): el estado congelado de capacidades es contrato de
// regresión. La guía docs/ops/legal_and_sales_guide.md declara "en preparación"
// Comandas/KDS, Salón y Anular boleta; estas rutas implementan el claim real
// (módulo presente, capability desactivada). Si alguien descongela la feature,
// este spec se pone RED y obliga a actualizar la guía antes de venderla.

test('F-6H: KDS permanece desactivado (claim congelado)', async ({ page }) => {
  await page.goto('/kds');
  await expect(page.getByTestId('kds-off')).toBeVisible();
  await expect(
    page.getByText('El display de cocina está desactivado para esta tienda.'),
  ).toBeVisible();
});

test('F-6H: Salón permanece desactivado (claim congelado)', async ({ page }) => {
  await page.goto('/salon');
  await expect(page.getByTestId('salon-off')).toBeVisible();
  await expect(page.getByText('Las comandas no están activas para esta tienda.')).toBeVisible();
});

test('F-6H: Anular boleta se declara en preparación en el historial', async ({ page }) => {
  await page.goto('/caja/historial');
  await expect(page.getByTestId('void-boleta-preparing')).toBeVisible();
  await expect(page.getByTestId('void-boleta-preparing')).toHaveText(/en preparación/i);
});
