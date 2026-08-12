import type { Page, Route } from '@playwright/test';

export interface LpdpE2eHarness {
  role: 'owner' | 'admin' | 'supervisor';
  eraseCalls: number;
  exportCalls: number;
  consentBodies: Record<string, unknown>[];
}

const customer = {
  id: 'customer-lpdp-e2e',
  documentTypeCode: '1',
  documentNumber: '12345678',
  piiErased: false,
};

const erasedCustomer = {
  id: 'customer-lpdp-erased',
  documentTypeCode: '1',
  documentNumber: '00000000',
  piiErased: true,
};

const consents = [
  {
    purpose: 'messaging_whatsapp',
    granted: true,
    grantedAtIso: '2026-08-10T12:00:00Z',
    revokedAtIso: null,
  },
  {
    purpose: 'marketing',
    granted: false,
    grantedAtIso: null,
    revokedAtIso: '2026-08-09T12:00:00Z',
  },
];

async function json(route: Route, body: Record<string, unknown>, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installAuthenticatedLpdpFixture(
  page: Page,
  initialRole: LpdpE2eHarness['role'] = 'admin',
): Promise<LpdpE2eHarness> {
  const harness: LpdpE2eHarness = {
    role: initialRole,
    eraseCalls: 0,
    exportCalls: 0,
    consentBodies: [],
  };
  await page.route('**/api/auth/session', async (route) => {
    await json(route, {
      userId: `${initialRole}-e2e`,
      role: initialRole,
      branchId: 'branch-e2e',
      terminal: { terminalId: 'terminal-e2e', terminalSessionId: 'terminal-session-e2e' },
    });
  });
  await page.route('**/api/customers?*', async (route) => {
    await json(route, { items: [customer, erasedCustomer], tenantId: 'tenant-e2e' });
  });
  await page.route('**/api/customers/customer-lpdp-e2e/consents', async (route) => {
    await json(route, { customerId: customer.id, consents });
  });
  await page.route('**/api/customers/customer-lpdp-erased/consents', async (route) => {
    await json(route, { customerId: erasedCustomer.id, consents: [] });
  });
  await page.route('**/api/customers/customer-lpdp-e2e/consent', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    harness.consentBodies.push(body);
    await json(route, {
      customerId: customer.id,
      ...body,
      kind: body.granted ? 'GRANT' : 'REVOKE',
    });
  });
  await page.route('**/api/customers/customer-lpdp-e2e/export', async (route) => {
    harness.exportCalls += 1;
    await json(route, {
      customerId: customer.id,
      profile: { documentNumber: '12345678', name: 'Ana Pérez' },
      consents,
      sales: [
        {
          sale_id: 's1',
          document_type: '01',
          series: 'F001',
          number: 1,
          issued_at_lima: '2026-08-01',
          total_amount_cents: 11800,
        },
      ],
      exportedAtIso: '2026-08-11T00:00:00Z',
    });
  });
  await page.route('**/api/customers/customer-lpdp-e2e/erase', async (route) => {
    harness.eraseCalls += 1;
    await json(route, {
      customerId: customer.id,
      fiscalSnapshotsAnonymized: 3,
      consentsRevoked: 2,
    });
  });
  return harness;
}
