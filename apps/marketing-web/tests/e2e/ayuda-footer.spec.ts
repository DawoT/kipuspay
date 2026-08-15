import { expect, test } from '@playwright/test';

// Parte I §2.4 (prueba gratuita), canales oficiales y el centro de ayuda con
// los badges "En preparación" (F-11) alineados a la guía.

test('ayuda: capacidades congeladas marcadas En preparación', async ({ page }) => {
  await page.goto('/ayuda');
  await expect(page.getByText('En preparación').first()).toBeVisible();
  await expect(
    page.getByText('¿Cómo activo la emisión de boletas y facturas electrónicas?'),
  ).toBeVisible();
  await expect(
    page.getByText('¿Cómo funcionan las membresías y las ventas recurrentes?'),
  ).toBeVisible();
});

test('home: claim de prueba de 30 días y canales oficiales en el footer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/30 días/).first()).toBeVisible();
  const footer = page.locator('footer');
  await expect(footer.getByText(/contacto@kipuspay\.com/)).toBeVisible();
  await expect(footer.getByText(/soporte@kipuspay\.com/)).toBeVisible();
  await expect(footer.getByText(/facturacion@kipuspay\.com/)).toBeVisible();
  await expect(footer.getByText(/privacidad@kipuspay\.com/)).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Libro de Reclamaciones' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Cumplimiento SUNAT' })).toBeVisible();
});
