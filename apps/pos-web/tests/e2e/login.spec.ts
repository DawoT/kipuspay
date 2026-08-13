import { expect, test } from '@playwright/test';

async function mockLogin(page: import('@playwright/test').Page, response: {
  status: number;
  body: Record<string, unknown>;
}) {
  await page.route('**/api/auth/cashier-login', (route) =>
    route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    }),
  );
}

test('login con badge y PIN inicia sesión y redirige al terminal', async ({ page }) => {
  await mockLogin(page, {
    status: 200,
    body: {
      token: 'jwt-e2e',
      expiresAt: '2026-08-14T00:00:00.000Z',
      user: { userId: 'u1', role: 'cashier', branchId: 'b1' },
    },
  });
  await page.goto('/login');
  await page.getByTestId('login-identifier').fill('EMP-12345');
  await page.getByTestId('login-pin').fill('1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-success')).toBeVisible();
  await expect(page).toHaveURL('/');
  const token = await page.evaluate(() => localStorage.getItem('kipuspay_token'));
  expect(token).toBe('jwt-e2e');
});

test('PIN incorrecto muestra credenciales inválidas', async ({ page }) => {
  await mockLogin(page, { status: 403, body: { code: 'PIN_INVALID' } });
  await page.goto('/login');
  await page.getByTestId('login-identifier').fill('EMP-12345');
  await page.getByTestId('login-pin').fill('9999');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('Credenciales inválidas');
});

test('lockout muestra el aviso de espera', async ({ page }) => {
  await mockLogin(page, { status: 403, body: { code: 'PIN_LOCKED' } });
  await page.goto('/login');
  await page.getByTestId('login-identifier').fill('EMP-12345');
  await page.getByTestId('login-pin').fill('1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('15 minutos');
});

test('capability off muestra el aviso del entorno', async ({ page }) => {
  await mockLogin(page, { status: 404, body: { code: 'FEATURE_OFF' } });
  await page.goto('/login');
  await page.getByTestId('login-identifier').fill('EMP-12345');
  await page.getByTestId('login-pin').fill('1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('desactivado');
});
