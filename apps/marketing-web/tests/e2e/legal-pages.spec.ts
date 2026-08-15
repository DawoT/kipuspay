import { expect, test } from '@playwright/test';

// Partes II/III/IV de docs/ops/legal_and_sales_guide.md: términos (Ley 29571,
// Distrito Judicial de Lima Centro), privacidad (Ley 29733 + D.S. 003-2013-JUS,
// derechos ARCO vía privacidad@) y SLA (SEV-1/2/3, 99.9%).

test('términos: Ley 29571 y Distrito Judicial de Lima Centro', async ({ page }) => {
  await page.goto('/terminos');
  await expect(page.getByText(/Ley 29571/)).toBeVisible();
  await expect(page.getByText(/Distrito Judicial de Lima Centro/)).toBeVisible();
  await expect(page.getByText(/kipuspay\.com\/reclamaciones/)).toBeVisible();
});

test('privacidad: Ley 29733, reglamento y canal ARCO', async ({ page }) => {
  await page.goto('/privacidad');
  await expect(page.getByText(/Ley 29733/)).toBeVisible();
  await expect(page.getByText(/D\.S\. 003-2013-JUS/)).toBeVisible();
  await expect(page.getByText(/privacidad@kipuspay\.com/).first()).toBeVisible();
  await expect(page.getByText(/alrededor de 5 años/)).toBeVisible();
});

test('seguridad: SLA SEV-1/2/3 y 99.9% de disponibilidad', async ({ page }) => {
  await page.goto('/seguridad');
  await expect(page.getByText('SEV-1 · La caja no cobra.')).toBeVisible();
  await expect(page.getByText('SEV-2 · Degradacion fiscal.')).toBeVisible();
  await expect(page.getByText('SEV-3 · Consultas y configuracion.')).toBeVisible();
  await expect(page.getByText('99.9% de disponibilidad mensual')).toBeVisible();
  await expect(page.getByText(/soporte@kipuspay\.com/).first()).toBeVisible();
});
