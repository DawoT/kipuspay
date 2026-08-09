import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [360, 375]) {
  test(`onboarding móvil accesible a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/mobile');
    await expect(page.getByRole('heading', { name: 'Configura este dispositivo' })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

    const undersizedTargets = await page
      .locator('button:not([disabled]), a[href]')
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label: element.textContent?.trim() ?? '',
              width: rect.width,
              height: rect.height,
            };
          })
          .filter(({ width: targetWidth, height }) => targetWidth < 48 || height < 48),
      );
    expect(undersizedTargets).toEqual([]);
  });
}
