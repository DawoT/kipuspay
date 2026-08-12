import { expect, test } from '@playwright/test';

test('home renderiza el total en soles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await expect(page.getByTestId('total')).toContainText('118.00');
});
