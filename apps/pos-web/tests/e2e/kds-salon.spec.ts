import { expect, test, type Page } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Sprint C2 — KDS/comandas/salón/split descongelados: el flujo completo del
// salón (crear comanda con catálogo real → enviar a cocina), el display de
// cocina (replay de pendientes + marcar listo) y la división de cuentas.
// Contrato nuevo tras el cierre del claim de comandas (Guía §16).

async function installRestaurantSession(page: Page) {
  await installAuthenticatedTenant(page, {
    tenantId: 't-e2e',
    role: 'cashier',
    branchId: 'branch-e2e',
    verticalType: 'restaurantes',
    tradeName: 'Restaurante E2E',
    capabilities: ['orders.kds', 'orders.lifecycle', 'orders.split_bill', 'catalog.sellable'],
    onboardingClaim: { branchId: 'branch-e2e', sessionId: 'session-e2e' },
  });
}

async function installApiFallback(page: Page) {
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/session' || pathname === '/api/tenant/context') {
      return route.fallback();
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test('salón: crear comanda con catálogo real y enviar a cocina', async ({ page }) => {
  await installRestaurantSession(page);
  await installApiFallback(page);
  await page.route('**/api/catalog/sellable**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ productId: 'p-cafe', name: 'Café Real', unitPriceCents: 1500 }],
      }),
    }),
  );
  const creates: Array<Record<string, unknown>> = [];
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    creates.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'order-e2e', status: 'OPEN', itemCount: 1 }),
    });
  });
  await page.route('**/api/orders/fire', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'order-e2e', status: 'FIRED', kdsVisible: true }),
    }),
  );

  await page.goto('/salon');
  await expect(page.getByTestId('salon')).toBeVisible();
  await expect(page.getByTestId('salon-off')).not.toBeVisible();
  await page.getByTestId('salon-table').fill('4');
  await page.getByTestId('salon-product').selectOption({ label: 'Café Real · S/ 15.00' });
  await page.getByTestId('salon-qty').fill('2');
  await page.getByRole('button', { name: /Enviar a cocina/ }).click();
  await expect(page.getByTestId('salon-status')).toContainText(/En cocina/);

  expect(creates).toHaveLength(1);
  const body = creates[0];
  expect(body).toMatchObject({ branchId: 'branch-e2e', tableLabel: '4' });
  expect((body.items as Array<Record<string, unknown>>)[0]).toMatchObject({
    productId: 'p-cafe',
    quantity: 2,
  });
});

test('cocina: replay de comandas pendientes y marcar listo', async ({ page }) => {
  // Sin worker en el e2e: el WebSocket real al preview crashea el webserver
  // (proxy ws a target muerto). Se reemplaza con un fake que falla limpio.
  await page.addInitScript(() => {
    (globalThis as Record<string, unknown>).WebSocket = class {
      onerror: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      constructor() {
        setTimeout(() => this.onerror?.(), 0);
      }
      close() {}
    };
  });
  await installRestaurantSession(page);
  await installApiFallback(page);
  await page.route('**/api/kds/ws-ticket', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ticket: 'kds-ticket-e2e', expiresInSeconds: 60 }),
    }),
  );
  await page.route('**/api/orders/kds-pending**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orders: [
          {
            id: 'order-kds-1',
            tableLabel: '7',
            items: [{ id: 'item-1', productName: 'Café Real', quantity: 2, status: 'FIRED' }],
          },
        ],
      }),
    }),
  );
  const readyBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/orders/items/ready', async (route) => {
    readyBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'order-kds-1', itemReadyCount: 1, orderStatus: 'READY' }),
    });
  });

  await page.goto('/kds');
  await expect(page.getByTestId('kds')).toBeVisible();
  await expect(page.getByTestId('kds-off')).not.toBeVisible();
  await expect(page.getByText('Mesa 7')).toBeVisible();
  await expect(page.getByText('Café Real')).toBeVisible();

  await page.getByTestId('kds-ready').first().click();
  await expect(readyBodies).toHaveLength(1);
  expect(readyBodies[0]).toMatchObject({ orderId: 'order-kds-1' });
});

test('split: dividir cuenta en dos pagos', async ({ page }) => {
  await installRestaurantSession(page);
  await installApiFallback(page);
  const splitBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/orders/split', async (route) => {
    splitBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orderId: 'order-e2e',
        orderStatus: 'PAID',
        portions: [
          { saleId: 'sale-a', itemIds: ['i1'], amountCents: 1500 },
          { saleId: 'sale-b', itemIds: ['i2'], amountCents: 1000 },
        ],
      }),
    });
  });

  await page.goto('/salon/split');
  await expect(page.getByTestId('split-root')).toBeVisible();
  await expect(page.getByTestId('split-off')).not.toBeVisible();
  await page.getByTestId('split-order').fill('order-e2e');
  await page.getByTestId('split-item-a').fill('i1');
  await page.getByTestId('split-item-b').fill('i2');
  await page.getByRole('button', { name: /Cobrar por partes/ }).click();
  await expect(page.getByTestId('split-result')).toContainText(/Cuenta dividida en 2 pagos/);

  expect(splitBodies).toHaveLength(1);
  const body = splitBodies[0];
  expect(body).toMatchObject({
    orderId: 'order-e2e',
    cashRegisterSessionId: 'session-e2e',
    series: 'NV01',
  });
  expect(body.portions as Array<Record<string, unknown>>).toHaveLength(2);
});
