import { expect, test } from '@playwright/test';

test('home con checkout off muestra demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tenant-name')).toBeVisible();
  await expect(page.getByTestId('total')).toContainText('118.00');
});
