import { expect, test } from '@playwright/test';

// Guía §6 (Modo vitrina) + Fix Sello QA: /vitrina es la pantalla del cliente
// y /kiosk cobra con sesión REAL y producto REAL del catálogo (el estado
// anterior usaba IDs demo 'k1'/'b-kiosk'/'s-kiosk' y un "Producto de ejemplo"
// que el server rechazaba — clase F-6/V-30).

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('vitrina: pantalla del cliente con total en vivo', async ({ page }) => {
  await page.addInitScript(
    ([session, claim]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay.onboarding.claim', claim);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION, CLAIM] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/vitrina');
  await expect(page.getByTestId('vitrina-root')).toBeVisible();
  await expect(page.getByText(/Esperando cobro/)).toBeVisible();
  await expect(page.getByTestId('vitrina-total')).toContainText(/S\/ 0\.00/);
});

test('kiosk: cobra con sesión y producto real del catálogo', async ({ page }) => {
  await page.addInitScript(
    ([session, claim]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay.onboarding.claim', claim);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
      localStorage.setItem('kipuspay:pos-terminal-id', 'terminal-e2e');
    },
    [SESSION, CLAIM] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/catalog/sellable**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ productId: 'p-cafe', name: 'Café real', unitPriceCents: 1500, costCents: 500 }],
      }),
    }),
  );
  await page.goto('/kiosk');
  await expect(page.getByTestId('kiosk-root')).toBeVisible();
  await expect(page.getByText('Café real')).toBeVisible();
  await expect(page.getByText(/Total a pagar/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Producto de ejemplo/);

  await page.getByTestId('kiosk-pay').click();
  await expect(page.getByTestId('kiosk-message')).toContainText(/Pagado/);
  await expect(page.getByTestId('kiosk-status')).toContainText(/cobr/i);

  // El kiosko cobra OFFLINE (offline-first) con cola en memoria (thin):
  // el contrato de payload con producto y sesión reales lo cubren los unit
  // tests de chargeCartOffline; aquí se sella la UI sin IDs demo.
  await expect(page.locator('main')).not.toContainText(/b-kiosk|s-kiosk|k1|Producto de ejemplo/);
  await expect(page.locator('main')).toContainText(/Café real/);
});
