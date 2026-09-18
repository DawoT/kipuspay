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

test('casos de éxito: no publica testimonios ni simulaciones sin evidencia', async ({ page }) => {
  await page.goto('/casos-de-exito');
  await expect(page.getByTestId('casos-page')).toBeVisible();
  await expect(page.getByTestId('casos-empty')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Casos de clientes');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Actualmente no hay casos de clientes publicados/i,
  );
  await expect(page.locator('main')).not.toContainText(
    /Impacto operativo medido|Voz del dueño|AHORRO AUDITADO/i,
  );
  await expect(page.locator('main')).not.toContainText(
    /números de mostrador real|mediciones de tiempos de atención reales|\d+ tickets\/d[ií]a/i,
  );
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, follow',
  );
});

test('verticales: no presentan simulaciones como resultados de operaciones reales', async ({
  page,
}) => {
  for (const slug of ['restaurantes', 'farmacias', 'retail', 'servicios', 'cadenas', 'grifos']) {
    await page.goto(`/para/${slug}`);
    await expect(page.getByTestId('vertical-landing')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(
      /Impacto operativo real|Mediciones de mostrador|medidas en operaciones reales|Balance operativo de mostrador/i,
    );
    await expect(page.locator('main')).not.toContainText(/\d+ tickets\/d[ií]a|Voz del dueño/i);
  }
});

test('blog: publica posts con enlaces y sin jerga técnica', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.getByTestId('blog-page')).toBeVisible();
  await expect(page.getByTestId('blog-post-link').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/\b(?:Edge|Workers|D1|ACID|CDR|UBL|PSE)\b/i);
});
