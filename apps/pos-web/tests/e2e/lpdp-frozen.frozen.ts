import { expect, test } from '@playwright/test';

test('la ruta titular apagada no recoge PII y conserva el canal humano', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.goto('/lpdp');

  await expect(page.getByTestId('lpdp-unavailable')).toBeVisible();
  await expect(page.getByTestId('lpdp-verify')).toHaveCount(0);
  await expect(page.getByTestId('lpdp-otp')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'privacidad@kipuspay.com' })).toHaveAttribute(
    'href',
    'mailto:privacidad@kipuspay.com',
  );
});
