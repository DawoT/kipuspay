import { expect, test } from '@playwright/test';
import { installAuthenticatedLpdpFixture } from './fixtures/lpdp.js';

test('admin lists customers without PII and opens consents', async ({ page }) => {
  await installAuthenticatedLpdpFixture(page, 'admin');
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('button', { name: /12345678/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /00000000/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /12345678/ })).not.toContainText('Ana Pérez');

  await page.getByRole('button', { name: /12345678/ }).click();
  await expect(page.getByText('Consentimientos por propósito')).toBeVisible();
  await expect(page.getByText('Mensajes por WhatsApp')).toBeVisible();
  await expect(page.getByText('Con consentimiento')).toBeVisible();
});

test('owner cannot see cash-operating controls and sees Clientes only as data panel', async ({
  page,
}) => {
  await installAuthenticatedLpdpFixture(page, 'owner');
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'POS Terminal' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Cierre Z' })).toHaveCount(0);
});

test('export downloads the titular copy (LPDP-02)', async ({ page }) => {
  const harness = await installAuthenticatedLpdpFixture(page, 'admin');
  await page.goto('/admin/clientes');
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await page.getByRole('button', { name: /12345678/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar copia de sus datos' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('datos-cliente-12345678.json');
  expect(harness.exportCalls).toBe(1);
});

test('erase requires double confirmation and never happens on the first click', async ({
  page,
}) => {
  const harness = await installAuthenticatedLpdpFixture(page, 'admin');
  await page.goto('/admin/clientes');
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await page.getByRole('button', { name: /12345678/ }).click();
  await page.getByRole('button', { name: 'Anonimizar sus datos' }).click();
  await expect(page.getByText('Esto no se puede deshacer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  expect(harness.eraseCalls).toBe(0);
  await page.getByTestId('customers-understand-check').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Confirmación final')).toBeVisible();
  await page.getByTestId('customers-erase-confirm-btn').click();
  expect(harness.eraseCalls).toBe(1);
  await expect(page.getByText(/cliente anonimizado/i)).toBeVisible();
});

test('erased customer shows fiscal-only state and export fails closed', async ({ page }) => {
  await installAuthenticatedLpdpFixture(page, 'supervisor');
  await page.goto('/admin/clientes');
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await page.getByRole('button', { name: /00000000/ }).click();
  await expect(page.getByText(/fue anonimizado/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar copia de sus datos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anonimizar sus datos' })).toHaveCount(0);
});
