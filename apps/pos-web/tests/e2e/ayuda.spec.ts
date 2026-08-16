import { expect, test } from '@playwright/test';

// Sello QA Batch G: /ayuda — soporte en caja con copy honesto y cero
// jerga técnica (refuerza V-26 en runtime: el operador nunca lee Edge/D1/
// ACID/CDR/UBL en esta pantalla).

test('ayuda: soporte en caja con copy honesto sin jerga técnica', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'kipuspay_user',
      JSON.stringify({ userId: 'cashier-e2e', role: 'cashier', branchId: 'branch-e2e' }),
    );
    localStorage.setItem('kipuspay_token', 'jwt-e2e');
    localStorage.setItem('kipuspay_tenant_id', 't-e2e');
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/ayuda');
  await expect(page.getByTestId('ayuda-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ayuda', exact: true })).toBeVisible();
  await expect(page.getByText(/Lo esencial para que la caja siga funcionando/)).toBeVisible();

  const sections = page.locator('.help-grid .help-title');
  await expect(sections).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'El internet se cortó' })).toBeVisible();
  await expect(
    page.getByText(/La caja sigue vendiendo sin conexión: el cobro se guarda en este dispositivo/),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cambio de turno' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'El cliente quiere una copia' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Necesito más ayuda' })).toBeVisible();

  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/Edge|D1|ACID|sharding|CDR|UBL|PSE|API|offline/i);
});
