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

test('privacidad: mantiene el canal ARCO humano mientras el autoservicio no está habilitado', async ({
  page,
}) => {
  await page.goto('/privacidad');
  await expect(page.getByText(/Ley 29733/)).toBeVisible();
  await expect(page.getByText(/D\.S\. 003-2013-JUS/)).toBeVisible();
  await expect(page.getByText(/privacidad@kipuspay\.com/).first()).toBeVisible();
  await expect(page.getByText(/alrededor de 5 años/)).toBeVisible();
  await expect(page.getByRole('link', { name: /ejercer tus derechos ARCO/i })).toHaveCount(0);
  await expect(page.getByTestId('privacidad-page').locator('p.legal-note')).toContainText(
    'El autoservicio de solicitudes está en validación y todavía no está disponible.',
  );
  await expect(
    page.getByTestId('privacidad-page').getByRole('link', { name: 'privacidad@kipuspay.com' }),
  ).toHaveAttribute('href', 'mailto:privacidad@kipuspay.com');
});

test('seguridad: publica tiempos de respuesta y describe la disponibilidad sin garantía porcentual', async ({
  page,
}) => {
  await page.goto('/seguridad');
  await expect(page.getByText('Prioridad Crítica: Interrupción del cobro.')).toBeVisible();
  await expect(page.getByText('Prioridad Alta: Trámites tributarios.')).toBeVisible();
  await expect(page.getByText('Prioridad Normal: Consultas y configuración.')).toBeVisible();
  await expect(page.getByText(/La experiencia puede variar según la conexión/)).toBeVisible();
  await expect(page.getByTestId('seguridad-page')).not.toContainText('99.9%');
  await expect(page.getByText(/soporte@kipuspay\.com/).first()).toBeVisible();
});
