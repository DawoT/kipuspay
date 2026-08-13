import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function expectNoBlockingA11y(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact ?? ''),
  );
  expect(blocking, `${label} — ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test('modal venta rápida: axe sin violaciones critical/serious', async ({ page }) => {
  await page.goto('/');
  if (await page.getByTestId('tour').isVisible()) {
    await page.getByTestId('tour-next').click();
  }
  await page.getByTestId('quick-sale').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoBlockingA11y(page, 'quick-sale modal');
});

test('modal venta rápida: foco en diálogo, trap de Tab y cierre con Escape', async ({ page }) => {
  await page.goto('/');
  if (await page.getByTestId('tour').isVisible()) {
    await page.getByTestId('tour-next').click();
  }
  await page.getByTestId('quick-sale').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByTestId('quick-sale-name')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('quick-sale-price')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('quick-sale-name')).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('quick-sale-add')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
