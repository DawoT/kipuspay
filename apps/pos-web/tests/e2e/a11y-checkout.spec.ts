import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('pantalla de cobro sin violaciones axe critical/serious', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KipusPay POS' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact ?? ''),
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
