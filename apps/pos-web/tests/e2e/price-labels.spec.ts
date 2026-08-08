import { expect, test } from '@playwright/test';

test('catalog navigation reaches an accessible label workbench', async ({ page }) => {
  await page.goto('/admin/catalogo');
  await expect(page.getByRole('link', { name: 'Etiquetas de precio' })).toHaveAttribute(
    'href',
    '/admin/etiquetas',
  );
  await page.getByRole('link', { name: 'Etiquetas de precio' }).click();
  await expect(page.getByRole('heading', { name: 'Etiquetas de precio' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/conexión|capability/i);
});

test('label controls expose state without color alone', async ({ page }) => {
  await page.goto('/admin/etiquetas');
  await expect(page.getByLabel('Buscar productos')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Formato de etiqueta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear lote' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('sesión administrativa autenticada');
  await expect(page.getByText('58 mm')).toBeVisible();
  await expect(page.getByText('80 mm')).toBeVisible();
});
