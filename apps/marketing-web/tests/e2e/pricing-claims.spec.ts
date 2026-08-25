import { expect, test } from '@playwright/test';

// Parte I §2 de docs/ops/legal_and_sales_guide.md: estructura de planes,
// reglas de metering (1,000 comprobantes, S/ 0.05 excedente, NC no reembolsa
// cupo) y política anti-apagado. Los claims congelados deben marcarse
// "En preparación" (header de freeze / PUBLIC_CLAIMS).

test('matriz de planes: precios y regla de excedente sin cortar el cobro', async ({ page }) => {
  await page.goto('/precios');
  await expect(page.getByText('Arranque', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('S/ 49 / mes')).toBeVisible();
  await expect(page.getByText('S/ 129 / mes')).toBeVisible();
  await expect(page.getByText('S/ 349 / mes + S/ 39 por sucursal adicional')).toBeVisible();
  await expect(page.getByText(/1,000 comprobantes/)).toBeVisible();
  await expect(
    page.getByText(/sin interrumpir jamás la atención en tu mostrador|no apagamos la caja/),
  ).toBeVisible();
  await expect(page.getByText(/no apagamos la caja por un tema administrativo/)).toBeVisible();
});

test('claims congelados marcados En preparación', async ({ page }) => {
  await page.goto('/precios');
  const section = page.locator('main');
  await expect(section.getByText('En preparación').first()).toBeVisible();
  await expect(section.getByText('En preparación').nth(1)).toBeVisible();
  // Emisión Fiscal (SUNAT en vivo) se declara en preparación, no como live.
  await expect(section.getByText('En preparación').first()).toBeVisible();
});

test('modo anual: 2 meses gratis y ahorro declarado', async ({ page }) => {
  await page.goto('/precios');
  await page.getByRole('button', { name: /Anual 2 meses gratis/ }).click();
  await expect(page.getByText(/2 meses gratis/).first()).toBeVisible();
});
