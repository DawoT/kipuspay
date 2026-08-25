import { expect, test } from '@playwright/test';

// docs/ops/legal_and_sales_guide.md §2.1/§6: las 5 landings por rubro con
// claims coherentes y las capacidades congeladas marcadas "En preparación".

const VERTICALS = [
  { slug: 'restaurantes', title: /KipusPay para restaurantes/i, frozen: true },
  { slug: 'farmacias', title: /KipusPay para farmacias/i, frozen: false },
  { slug: 'retail', title: /KipusPay para retail/i, frozen: false },
  { slug: 'servicios', title: /KipusPay para servicios/i, frozen: false },
  { slug: 'cadenas', title: /KipusPay para cadenas/i, frozen: false },
];

for (const v of VERTICALS) {
  test(`vertical ${v.slug}: landing con claims y sin jerga técnica`, async ({ page }) => {
    await page.goto(`/para/${v.slug}`);
    await expect(page).toHaveTitle(v.title);
    await expect(page.getByText(/Probar gratis|Empieza gratis/).first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(
      /\b(?:Edge|Workers|D1|ACID|CDR|UBL|PSE)\b/i,
    );
    if (v.frozen) {
      await expect(page.locator('main').getByText('EN PREPARACIÓN').first()).toBeVisible();
    }
  });
}
