import { expect, test } from '@playwright/test';

const briefing = {
  reportDate: '2026-08-03',
  briefing: JSON.stringify({
    bullets: [
      'Ventas del día: S/ 118000 en 42 comprobantes.',
      'Sin alertas de quiebre de stock.',
      'Sin diferencias de caja pendientes.',
    ],
    disclaimer: 'Datos del día 2026-08-03, calculados por el servidor.',
  }),
  staleAt: '2026-08-03',
};

test('dueño ve el resumen del servidor con banner de antigüedad', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
      }),
    }),
  );
  await page.route('**/api/insights/briefing*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(briefing) }),
  );
  await page.goto('/owner');
  await expect(page.getByTestId('owner-briefing')).toBeVisible();
  await expect(page.getByText('Datos del 2026-08-03, no en vivo.')).toBeVisible();
  await expect(page.getByText('Ventas del día: S/ 118000 en 42 comprobantes.')).toBeVisible();
});

test('asistente: pregunta responde con el texto del SSE', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'owner-e2e',
        role: 'owner',
        branchId: 'branch-e2e',
        terminal: null,
      }),
    }),
  );
  await page.route('**/api/insights/briefing*', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/insights/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"text":"Ventas: S/ 118000 en 42 comprobantes."}\n\n',
    }),
  );
  await page.goto('/owner/asistente');
  await expect(page.getByTestId('assistant-page')).toBeVisible();
  await page.getByTestId('assistant-question').fill('¿cómo van las ventas?');
  await page.getByTestId('assistant-ask').click();
  await expect(page.getByTestId('assistant-answer')).toContainText('118000');
});
