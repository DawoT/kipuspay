import { expect, test } from '@playwright/test';

test('homepage avoids advertising gated SUNAT sending or continuous live data', async ({
  page,
}) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(
    'KipusPay — Atiende más rápido, organiza tu caja y controla tu negocio',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Atiende más rápido, organiza tu caja y controla tu negocio desde el celular.',
  );

  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).toMatch(/opciones de facturación electrónica dependen de su habilitación/i);
  expect(description).toMatch(/SUNAT determina la aceptación/i);

  const visibleCopy = await page.locator('main').innerText();
  expect(visibleCopy).not.toMatch(
    /factura en automático|100% legal|en tiempo real|en vivo|cajas en línea|guiamos el envío|env[ií]a comprobantes|reintenta el envío|se acerca al plazo|plazo de declaración|estado de tus comprobantes|5 minutos/i,
  );
});
