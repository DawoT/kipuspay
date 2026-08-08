import type { Page, Route } from '@playwright/test';

export type CustomerOrderE2eRole = 'cashier' | 'supervisor' | 'admin' | 'owner';

export interface CustomerOrderE2eHarness {
  role: CustomerOrderE2eRole;
  leaseTtlSeconds: number;
  fulfillCalls: number;
  lastCreateBody: Record<string, unknown> | null;
  lastRequestHeaders: Record<string, string>;
}

const summary = {
  id: 'order-e2e',
  branch_id: 'branch-e2e',
  customer_id: 'customer-e2e',
  status: 'OPEN',
  pickup_at: null,
  reserved_until: '2099-08-09T12:00:00.000Z',
  version: 1,
};

const detail = {
  ...summary,
  created_by_user_id: 'cashier-e2e',
  items: [
    {
      id: 'item-e2e',
      product_id: 'product-e2e',
      product_name: 'Café reservado',
      product_uom_id: 'uom-e2e',
      requested_quantity_microunits: 2_000_000,
      reserved_quantity_microunits: 2_000_000,
      fulfilled_quantity_microunits: 0,
      released_quantity_microunits: 0,
      unit_price_cents: 1850,
    },
  ],
};

async function json(route: Route, body: Record<string, unknown>, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installAuthenticatedCustomerOrderFixture(
  page: Page,
  initialRole: CustomerOrderE2eRole = 'cashier',
): Promise<CustomerOrderE2eHarness> {
  const harness: CustomerOrderE2eHarness = {
    role: initialRole,
    leaseTtlSeconds: 300,
    fulfillCalls: 0,
    lastCreateBody: null,
    lastRequestHeaders: {},
  };
  await page.addInitScript(() => {
    localStorage.setItem('kipuspay:pos-terminal-id', 'terminal-e2e');
  });
  await page.route('**/api/auth/session', async (route) => {
    const owner = harness.role === 'owner';
    await json(route, {
      userId: `${harness.role}-e2e`,
      role: harness.role,
      branchId: owner ? '' : 'branch-e2e',
      terminal: owner
        ? null
        : {
            terminalId: 'terminal-e2e',
            terminalSessionId: 'terminal-session-e2e',
          },
    });
  });
  await page.route('**/api/orders/customer-orders**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    harness.lastRequestHeaders = request.headers();
    if (request.method() === 'GET' && path.endsWith('/customer-orders')) {
      await json(route, { orders: [summary] });
      return;
    }
    if (request.method() === 'GET' && path.endsWith('/order-e2e')) {
      await json(route, detail);
      return;
    }
    if (path.endsWith('/leases')) {
      await json(
        route,
        {
          envelope: `opaque-e2e-${harness.leaseTtlSeconds}`,
          envelopeId: 'envelope-e2e',
          scope: 'CUSTOMER_ORDER_FULFILL',
          oneShot: true,
          ttlSeconds: harness.leaseTtlSeconds,
        },
        201,
      );
      return;
    }
    if (path.endsWith('/fulfill')) {
      harness.fulfillCalls += 1;
      await json(route, {
        orderId: 'order-e2e',
        saleId: 'sale-e2e',
        saleItemId: 'sale-item-e2e',
        status: 'PARTIAL',
        totalAmountCents: 1850,
        alreadyApplied: harness.fulfillCalls > 1,
      });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/customer-orders')) {
      harness.lastCreateBody = request.postDataJSON() as Record<string, unknown>;
      await json(
        route,
        {
          orderId: 'created-e2e',
          status: 'OPEN',
          saleId: null,
          paymentId: null,
          fiscalDocumentId: null,
          alreadyApplied: false,
        },
        201,
      );
      return;
    }
    await json(route, { code: 'E2E_ROUTE_NOT_IMPLEMENTED' }, 501);
  });
  return harness;
}
