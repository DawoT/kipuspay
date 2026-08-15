import { expect, test } from '@playwright/test';

/**
 * F-3 (auditoría browser) — el resumen agéntico (/api/insights/briefing)
 * devuelve 403 PLAN_REQUIRES_CADENA para planes sin Cadena+. El widget del
 * Dueño debe estar plan-gateado y NO solicitar el briefing en ese caso.
 */
test('F-3: sin plan Cadena el Dueño no consulta /api/insights/briefing', async ({ page }) => {
  let briefingCalls = 0;
  await page.route('**/api/insights/briefing*', (route) => {
    briefingCalls += 1;
    void route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Requires Cadena plan', code: 'PLAN_REQUIRES_CADENA' }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('kipuspay_token', 'jwt-owner-e2e');
    localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    localStorage.setItem(
      'kipuspay_user',
      JSON.stringify({ userId: 'owner-e2e', role: 'owner', branchId: 'b-e2e' }),
    );
  });
  await page.goto('/owner');
  await expect(page.getByTestId('owner-hoy')).toBeVisible();
  expect(briefingCalls, 'el briefing no debe consultarse sin plan Cadena').toBe(0);
});