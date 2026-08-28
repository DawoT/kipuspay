import { expect, test } from '@playwright/test';

test('owner mode reaches the forecast workbench with controls and empty state', async ({
  page,
}) => {
  await page.goto('/owner/previsiones');

  await expect(page.getByRole('heading', { name: 'Previsiones de venta' })).toBeVisible();
  await expect(page.getByTestId('owner-forecast-branch')).toBeVisible();
  await expect(page.getByTestId('owner-forecast-refresh')).toBeVisible();
  await expect(page.getByTestId('owner-forecast-card')).toBeVisible();
});

test('forecast page degrades gracefully offline without inventing data', async ({ page }) => {
  await page.goto('/owner/previsiones');
  await expect(page.getByTestId('owner-forecast-status')).toContainText(/pronóstico|Sin conexión/i);
  await expect(page.getByTestId('owner-forecast-off')).toHaveCount(0);
});
