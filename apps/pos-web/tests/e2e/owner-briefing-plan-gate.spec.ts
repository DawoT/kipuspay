import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

/**
 * F-3 (auditoría browser) — el resumen agéntico (/api/insights/briefing)
 * devuelve 403 PLAN_REQUIRES_CADENA para planes sin Cadena+. El widget del
 * Dueño debe estar plan-gateado: oculto sin error, y el veredicto se cachea
 * (negativo fail-closed) para no volver a consultar el endpoint en cada carga.
 * El servidor sigue siendo autoritativo: la cache solo evita llamadas.
 */
test('F-3: sin plan Cadena el briefing se oculta y el gate evita re-consultas', async ({
  page,
}) => {
  let briefingCalls = 0;
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-briefing',
    role: 'owner',
    capabilities: ['owner.mode', 'analytics.agentic_insights'],
  });
  await page.route('**/api/insights/briefing*', (route) => {
    briefingCalls += 1;
    void route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Requires Cadena plan', code: 'PLAN_REQUIRES_CADENA' }),
    });
  });
  await page.goto('/owner');
  await expect(page.getByTestId('owner-hoy')).toBeVisible();
  await expect(page.getByTestId('owner-briefing')).not.toBeVisible();
  expect(briefingCalls, '1ª visita consulta una vez y aprende el veredicto').toBe(1);
  await page.reload();
  await expect(page.getByTestId('owner-hoy')).toBeVisible();
  await expect(page.getByTestId('owner-briefing')).not.toBeVisible();
  expect(briefingCalls, 'recarga: veredicto cacheado, sin nueva consulta').toBe(1);
});
