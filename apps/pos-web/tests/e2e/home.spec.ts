import { expect, test } from '@playwright/test';

test('home renderiza el total en soles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KipusPay POS' })).toBeVisible();
  await expect(page.getByText('S/ 118.00')).toBeVisible();
});
