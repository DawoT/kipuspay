import { expect, test } from '@playwright/test';

// Guía Parte I §1.3 + audit A8: comparativas por rubro, casos de éxito con
// copy honesto (autorización explícita) y blog con posts reales.

test('comparar: rubro-switch entre Bsale/Alegra/Siigo con tabla', async ({ page }) => {
  await page.goto('/comparar?vs=bsale');
  await expect(page.getByTestId('compare-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/vs Bsale/);
  await expect(page.getByRole('link', { name: /Bsale/ }).first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/\b(?:Edge|Workers|D1|ACID|CDR|UBL|PSE)\b/i);
  await expect(
    page.getByRole('link', { name: /Probar gratis|Empieza gratis/ }).first(),
  ).toBeVisible();
});

test('casos de éxito: copy honesto de autorización explícita', async ({ page }) => {
  await page.goto('/casos-de-exito');
  await expect(page.getByTestId('casos-page')).toBeVisible();
  await expect(
    page.getByText(/Solo publicamos testimonios cuando el negocio nos autoriza explícitamente/),
  ).toBeVisible();
});

test('blog: publica posts con enlaces y sin jerga técnica', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.getByTestId('blog-page')).toBeVisible();
  await expect(page.getByTestId('blog-post-link').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/\b(?:Edge|Workers|D1|ACID|CDR|UBL|PSE)\b/i);
});
