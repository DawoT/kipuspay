import { expect, test, type Page } from '@playwright/test';

async function mockSession(page: Page, role: string) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: role === 'owner' ? 'owner-e2e' : 'cashier-e2e',
        role,
        branchId: 'branch-e2e',
        terminal: null,
        tradeName: 'Demo KipusPay',
        formalizationMode: 'INTERNAL_CONTROL',
      }),
    }),
  );
}

async function mockGrowthEvents(page: Page, events: string[]) {
  await page.route('**/api/growth/events', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
      });
    }
    const body = (route.request().postDataJSON() ?? {}) as { eventType: string };
    if (body.eventType) events.push(body.eventType);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

async function mockSetupProgress(page: Page, server: Record<string, boolean>) {
  await page.route('**/api/onboarding/setup-progress', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ server, formalizationMode: 'INTERNAL_CONTROL' }),
    }),
  );
}

test('caja: el tour guía por capabilities y no reaparece al cerrarlo', async ({ page }) => {
  const events: string[] = [];
  await mockSession(page, 'cashier');
  mockGrowthEvents(page, events);
  await page.goto('/');
  await expect(page.getByTestId('tour')).toBeVisible();
  await expect(page.getByTestId('tour-body')).toContainText('Agrega tus productos');
  // El tour recorre un paso por capability activa (quick_add + promotions +
  // variants con el env completo): avanza hasta el último y cierra.
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId('tour').isHidden()) break;
    await page.getByTestId('tour-next').click();
  }
  await expect(page.getByTestId('tour')).toBeHidden();
  expect(events).toContain('tour_started');
  expect(events).toContain('tour_completed');
  // Persistencia local: al recargar no reaparece.
  await page.reload();
  await expect(page.getByTestId('tour')).toBeHidden();
});

test('caja: omitir el tour lo registra y no reaparece', async ({ page }) => {
  const events: string[] = [];
  await mockSession(page, 'cashier');
  mockGrowthEvents(page, events);
  await page.goto('/');
  await expect(page.getByTestId('tour')).toBeVisible();
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toBeHidden();
  expect(events).toContain('tour_dismissed');
  await page.reload();
  await expect(page.getByTestId('tour')).toBeHidden();
});

test('caja: el tour se omite si el negocio ya vendió (criterio S52)', async ({ page }) => {
  await mockSession(page, 'cashier');
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'kipuspay.pos.tenant.v1',
      JSON.stringify({
        tenantId: 'demo',
        tradeName: 'Demo KipusPay',
        formalizationMode: 'INTERNAL_CONTROL',
        verticalType: 'retail',
        onboardingStartedAtIso: '2026-08-01T12:00:00.000Z',
        firstSaleAtIso: '2026-08-02T12:00:00.000Z',
        brandQrEnabled: true,
        referralCode: null,
      }),
    );
  });
  await page.goto('/');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('tour')).toBeHidden();
});

test('configuración: checklist con barra, pasos y FAQ contextual; ocultar persiste', async ({
  page,
}) => {
  const events: string[] = [];
  await mockSession(page, 'owner');
  mockGrowthEvents(page, events);
  mockSetupProgress(page, { logo: true, invoicing: false, team: true, catalog: false });
  await page.goto('/admin/configuracion');
  await expect(page.getByTestId('setup-checklist')).toBeVisible();
  // El paso impresora depende del preflight local del navegador (puede variar):
  // la barra nunca muestra 100% con pasos server pendientes y el estado de
  // cada paso server se refleja.
  await expect(page.getByTestId('setup-percent')).not.toContainText('100%');
  await expect(page.getByTestId('setup-step-logo')).toHaveClass(/done/);
  await expect(page.getByTestId('setup-step-invoicing')).not.toHaveClass(/done/);
  await page.getByTestId('setup-hide').click();
  await expect(page.getByTestId('setup-checklist')).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('setup-checklist')).toBeHidden();
  expect(events).toContain('setup_checklist_step_completed');
});

test('modo dueño: checklist visible sin bloquear el dashboard', async ({ page }) => {
  await mockSession(page, 'owner');
  mockSetupProgress(page, { logo: true, invoicing: true, team: true, catalog: true });
  await page.goto('/owner');
  await expect(page.getByTestId('owner-checklist')).toBeVisible();
  await expect(page.getByTestId('setup-percent')).toContainText('100%');
  await page.getByTestId('owner-checklist-hide').click();
  await expect(page.getByTestId('owner-checklist')).toBeHidden();
});
