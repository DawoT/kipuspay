import { expect, test } from '@playwright/test';

test('home con checkout off muestra demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KipusPay POS' })).toBeVisible();
  await expect(page.getByText(/118\.00/)).toBeVisible();
});
