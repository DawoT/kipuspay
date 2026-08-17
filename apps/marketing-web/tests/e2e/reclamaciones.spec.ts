import { expect, test } from '@playwright/test';

// Parte II §3 de docs/ops/legal_and_sales_guide.md: el Libro de Reclamaciones
// Virtual emite un número de caso REC-AAAAMMDD-XXXX como acuse de recepción
// (Ley 29571). El flujo usa el worker real en producción; aquí se mockea la
// respuesta para sellar el contrato del formulario y del acuse.

const CASE_NUMBER = 'REC-20260815-1A2B3C';

test('el formulario emite un acuse REC- con número de caso', async ({ page }) => {
  await page.route('**/v1/reclamaciones', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        caseNumber: CASE_NUMBER,
        receivedAt: '2026-08-15T12:00:00.000Z',
        message: 'Reclamo registrado. Conserva el número de caso como acuse.',
      }),
    }),
  );
  await page.goto('/reclamaciones');
  await page.getByTestId('rec-name').fill('Cliente e2e');
  await page.getByTestId('rec-doc').fill('46018239');
  await page.getByTestId('rec-email').fill('cliente@test.pe');
  await page.getByTestId('rec-detail').fill('Reclamo de verificación sellado con e2e');
  await page.getByTestId('rec-submit').click();

  await expect(page.getByText(`Número de caso: ${CASE_NUMBER}`)).toBeVisible();
  await expect(page.getByText(CASE_NUMBER)).toHaveText(/^REC-\d{8}-[A-F0-9]{6}$/);
});

test('servidor caído no deja al consumidor sin guía', async ({ page }) => {
  await page.route('**/v1/reclamaciones', (route) => route.abort());
  await page.goto('/reclamaciones');
  await page.getByTestId('rec-name').fill('Cliente e2e');
  await page.getByTestId('rec-doc').fill('46018239');
  await page.getByTestId('rec-email').fill('cliente@test.pe');
  await page.getByTestId('rec-detail').fill('Reclamo con el servicio caído');
  await page.getByTestId('rec-submit').click();

  await expect(
    page.getByText('No se pudo contactar el libro de reclamaciones', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/Canal oficial de reclamos/)).toBeVisible();
});
